import type { Entity } from '@backstage/catalog-model';
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import type {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
} from '@backstage/plugin-catalog-node';
import type { LocationSpec } from '@backstage/plugin-catalog-common';
import {
  DefaultGithubCredentialsProvider,
  type GithubCredentialsProvider,
  type ScmIntegrationRegistry,
  ScmIntegrations,
} from '@backstage/integration';
import { BuildReadinessFlags } from '@giantswarm/backstage-plugin-gs-common';
import { resolveGithubToken } from '../util/githubToken';
import { type Cached, TtlCache } from '../util/TtlCache';

const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const BUILD_STATUS_LABEL = 'giantswarm.io/build-status';
const BUILD_FAILING_CHECKS_ANNOTATION = 'giantswarm.io/build-failing-checks';
const BUILD_STATUS_CHECKED_ANNOTATION = 'giantswarm.io/build-status-checked';
const DEFAULT_BRANCH_ANNOTATION = 'giantswarm.io/default-branch';
const READINESS_FLAGS_ANNOTATION = 'giantswarm.io/readiness-flags';

/**
 * The default branch does not build. Merged into `giantswarm.io/readiness-flags`
 * so the one list names everything standing between a component and its next
 * release; the name lives in gs-common so the devportal can attribute it to the
 * build rather than to the release or to chart metadata.
 */
const FLAG_BUILD_RED = BuildReadinessFlags.buildRed;

/**
 * Build verdicts. `unknown` is a first-class outcome: a red we could not
 * attribute to the default branch is unproven, not a failure — and not a pass.
 */
export const BUILD_PASSING = 'passing';
export const BUILD_FAILING = 'failing';
export const BUILD_UNKNOWN = 'unknown';

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
// GitHub caps `contexts(first:)` at 100. Anything past it is invisible to us,
// and a failure past the page boundary must not read as a green branch.
const CONTEXTS_PAGE_SIZE = 100;

/** A CircleCI build URL as GitHub stores it in a status `targetUrl`. */
const CIRCLE_BUILD = /circleci\.com\/(gh|bb)\/([^/]+)\/([^/]+)\/(\d+)/;

/**
 * CircleCI build outcomes that are not a verdict on the code. A canceled build
 * is one superseded by a newer commit, not a failure.
 */
const CIRCLE_NON_VERDICT = new Set([
  'canceled',
  'cancelled',
  'not_run',
  'queued',
  'running',
  'retried',
  'not_running',
]);

const CHECK_RUN_FAILURES = new Set(['FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE']);
const STATUS_FAILURES = new Set(['FAILURE', 'ERROR']);

/**
 * One entry of the default branch HEAD's `statusCheckRollup`, as GitHub returns
 * it. Check runs (GitHub Actions and the like) know which branch their suite
 * ran on; legacy commit statuses (CircleCI) hang off the SHA alone.
 */
export type RollupContext =
  | {
      kind: 'check';
      name: string;
      conclusion: string | null;
      detailsUrl: string | null;
      /**
       * The branch the check suite ran on. `null` for a tag-triggered (or
       * fork) run on the same SHA, which is unproven for this branch.
       */
      suiteBranch: string | null;
    }
  | {
      kind: 'status';
      context: string;
      state: string;
      targetUrl: string | null;
    };

export type Rollup = {
  defaultBranch: string;
  /** Contexts GitHub reports in total; more than we fetched means truncated. */
  totalCount: number;
  contexts: RollupContext[];
};

/** What CircleCI's v1.1 build endpoint tells us about one build. */
export type CircleBuild = {
  branch: string | null;
  /** `status` or `outcome`, lowercased. */
  outcome: string;
};

/** A red that could not be counted against the default branch on GitHub's evidence alone. */
type Unproven = { name: string; url: string | null };

export type Verdict = {
  status: string;
  /** Names of the checks confirmed failing on the default branch. */
  failingChecks: string[];
};

type BuildLookup = {
  verdict: Verdict | undefined;
  defaultBranch: string | undefined;
};

type FetchFn = typeof fetch;

const ROLLUP_QUERY = `
query BuildStatus($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      name
      target {
        ... on Commit {
          statusCheckRollup {
            contexts(first: $first) {
              totalCount
              nodes {
                __typename
                ... on CheckRun {
                  name
                  conclusion
                  detailsUrl
                  checkSuite { branch { name } }
                }
                ... on StatusContext {
                  context
                  state
                  targetUrl
                }
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Annotates Component entities with whether their default branch builds.
 *
 * The expensive part of a broken build was never the fix; it was nobody
 * knowing. `resource-police` had not built for six months because its CircleCI
 * checkout key was revoked — a project-settings fix — and that blocked its
 * migration for as long, because nothing anywhere said so.
 *
 * GitHub cannot answer "does main build" by itself: legacy commit statuses hang
 * off a SHA with no branch attached, so a build on a branch cut off main, on a
 * merge-queue branch or on a tag lands on main's status. CircleCI can answer
 * it. Its v1.1 build endpoint reports the build's branch and outcome, so a
 * status is only counted against the default branch when the build really ran
 * there and really reached a failing verdict. Anything that cannot be resolved
 * stays unproven, and an unproven red is reported as `unknown` — never as a
 * failure, and never as a pass.
 *
 * Writes the verdict, the failing check names, and merges `BUILD-RED` into
 * `giantswarm.io/readiness-flags` when failing. Never touches the release
 * verdict in `giantswarm.io/readiness`: whether the release that already exists
 * reached the registry is a different question from whether the next one can
 * be built.
 */
export class BuildStatusProcessor implements CatalogProcessor {
  private readonly logger: LoggerService;
  private readonly credentialsProvider: GithubCredentialsProvider;
  private readonly integrations: ScmIntegrationRegistry;
  private readonly circleciToken: string | undefined;
  private readonly fetchImpl: FetchFn;
  /** The whole lookup — rollup, attribution and verdict — keyed `owner/repo`. */
  private readonly lookupCache: TtlCache<BuildLookup>;
  /**
   * CircleCI builds keyed by URL. A finished build's branch and outcome never
   * change, but a running one becomes a verdict later, so this expires like
   * everything else rather than living forever.
   */
  private readonly circleCache: TtlCache<CircleBuild | undefined>;

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    fetchImpl?: FetchFn;
  }): BuildStatusProcessor {
    const { config, logger, fetchImpl } = options;
    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    const cacheTtlSeconds = config.getOptionalNumber(
      'catalog.processors.buildStatus.cacheTtlSeconds',
    );
    return new BuildStatusProcessor({
      logger,
      credentialsProvider,
      integrations,
      circleciToken: config.getOptionalString(
        'catalog.processors.buildStatus.circleciToken',
      ),
      cacheTtlMs:
        cacheTtlSeconds !== undefined
          ? cacheTtlSeconds * 1000
          : DEFAULT_CACHE_TTL_MS,
      fetchImpl,
    });
  }

  constructor(options: {
    logger: LoggerService;
    credentialsProvider: GithubCredentialsProvider;
    integrations: ScmIntegrationRegistry;
    circleciToken?: string;
    cacheTtlMs?: number;
    fetchImpl?: FetchFn;
  }) {
    this.logger = options.logger;
    this.credentialsProvider = options.credentialsProvider;
    this.integrations = options.integrations;
    this.circleciToken = options.circleciToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.lookupCache = new TtlCache(cacheTtlMs);
    this.circleCache = new TtlCache(cacheTtlMs);
  }

  getProcessorName(): string {
    return 'BuildStatusProcessor';
  }

  async preProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    _emit: CatalogProcessorEmit,
    _originLocation: LocationSpec,
    _cache: CatalogProcessorCache,
  ): Promise<Entity> {
    if (entity.kind !== 'Component') {
      return entity;
    }

    const slug = parseSlug(
      entity.metadata.annotations?.[PROJECT_SLUG_ANNOTATION],
    );
    if (!slug) {
      return entity;
    }

    let lookup: Cached<BuildLookup>;
    try {
      lookup = await this.lookupCache.get(`${slug.owner}/${slug.repo}`, () =>
        this.lookup(slug),
      );
    } catch (error) {
      // GitHub could not be asked. Static message, identifiers in metadata: a
      // rate-limit episode hits every repo at once, and Sentry fingerprints on
      // the message.
      this.logger.warn('BuildStatusProcessor: status lookup failed', {
        owner: slug.owner,
        repo: slug.repo,
        error: String(error),
      });
      return withBuildStatus(entity, {
        verdict: { status: BUILD_UNKNOWN, failingChecks: [] },
      });
    }

    if (!lookup.value.verdict) {
      // No CI reports to this branch at all. There is nothing to say, and
      // saying "unknown" would suggest we looked for something that exists.
      return entity;
    }

    return withBuildStatus(entity, {
      verdict: lookup.value.verdict,
      defaultBranch: lookup.value.defaultBranch,
      checkedAt: lookup.fetchedAt,
    });
  }

  private async lookup(slug: {
    owner: string;
    repo: string;
  }): Promise<BuildLookup> {
    const rollup = await this.fetchRollup(slug);
    if (!rollup) {
      return { verdict: undefined, defaultBranch: undefined };
    }

    const urls = unprovenReds(rollup)
      .map(item => item.url)
      .filter((url): url is string => Boolean(url && CIRCLE_BUILD.test(url)));
    const builds = new Map<string, CircleBuild | undefined>();
    await Promise.all(
      Array.from(new Set(urls)).map(async url => {
        builds.set(url, await this.resolveCircleBuild(url));
      }),
    );

    return {
      verdict: verdict(rollup, builds),
      defaultBranch: rollup.defaultBranch,
    };
  }

  private async fetchRollup(slug: {
    owner: string;
    repo: string;
  }): Promise<Rollup | undefined> {
    const url = `https://github.com/${slug.owner}/${slug.repo}`;
    const token = await resolveGithubToken({
      url,
      credentialsProvider: this.credentialsProvider,
      integrations: this.integrations,
      logger: this.logger,
    });
    if (!token) {
      // GraphQL has no anonymous mode. Unlike the REST-backed processors there
      // is no degraded path here, so this is a configuration gap worth a
      // warning rather than a per-entity debug line.
      throw new Error('no GitHub token available for GraphQL');
    }

    const response = await this.fetchImpl(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        query: ROLLUP_QUERY,
        variables: {
          owner: slug.owner,
          name: slug.repo,
          first: CONTEXTS_PAGE_SIZE,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub GraphQL returned ${response.status}: ${response.statusText}`,
      );
    }
    const body = (await response.json()) as GraphqlResponse;
    if (body.errors?.length) {
      throw new Error(
        `GitHub GraphQL errors: ${body.errors.map(e => e.message).join('; ')}`,
      );
    }
    return parseRollup(body);
  }

  private async resolveCircleBuild(
    url: string,
  ): Promise<CircleBuild | undefined> {
    // A rejected fill is not cached, so a CircleCI hiccup is retried next pass
    // instead of pinning the component at unknown for a whole TTL.
    const cached = await this.circleCache
      .get(url, () => this.fetchCircleBuild(url))
      .catch(() => undefined);
    return cached?.value;
  }

  private async fetchCircleBuild(
    url: string,
  ): Promise<CircleBuild | undefined> {
    const match = CIRCLE_BUILD.exec(url);
    if (!match) {
      return undefined;
    }
    const [, vcs, org, project, number] = match;
    const api = `https://circleci.com/api/v1.1/project/${vcs}/${org}/${project}/${number}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.circleciToken) {
      headers['Circle-Token'] = this.circleciToken;
    }
    const response = await this.fetchImpl(api, { headers });
    if (!response.ok) {
      // Private project without a token, a deleted build, a 5xx: we cannot
      // attribute this red. It stays unproven.
      this.logger.debug('BuildStatusProcessor: CircleCI build not readable', {
        url: api,
        status: response.status,
      });
      return undefined;
    }
    const body = (await response.json()) as {
      branch?: string | null;
      status?: string | null;
      outcome?: string | null;
    };
    return {
      branch: body.branch ?? null,
      outcome: (body.status ?? body.outcome ?? '').toLowerCase(),
    };
  }
}

type GraphqlResponse = {
  data?: {
    repository?: {
      defaultBranchRef?: {
        name: string;
        target?: {
          statusCheckRollup?: {
            contexts?: {
              totalCount: number;
              nodes?: Array<Record<string, any>>;
            };
          } | null;
        };
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

export function parseRollup(body: GraphqlResponse): Rollup | undefined {
  const ref = body.data?.repository?.defaultBranchRef;
  if (!ref) {
    return undefined;
  }
  const rollup = ref.target?.statusCheckRollup;
  if (!rollup) {
    // No CI has ever reported to this commit. Not the same as "unknown".
    return { defaultBranch: ref.name, totalCount: 0, contexts: [] };
  }
  const contexts: RollupContext[] = [];
  for (const node of rollup.contexts?.nodes ?? []) {
    if (node.__typename === 'CheckRun') {
      contexts.push({
        kind: 'check',
        name: node.name ?? 'check',
        conclusion: node.conclusion ?? null,
        detailsUrl: node.detailsUrl ?? null,
        suiteBranch: node.checkSuite?.branch?.name ?? null,
      });
    } else if (node.__typename === 'StatusContext') {
      contexts.push({
        kind: 'status',
        context: node.context ?? 'status',
        state: node.state ?? '',
        targetUrl: node.targetUrl ?? null,
      });
    }
  }
  return {
    defaultBranch: ref.name,
    totalCount: rollup.contexts?.totalCount ?? contexts.length,
    contexts,
  };
}

/**
 * Reds that GitHub alone cannot pin to the default branch: every failing legacy
 * status, and every failing check run whose suite has no branch.
 */
function unprovenReds(rollup: Rollup): Unproven[] {
  const out: Unproven[] = [];
  for (const ctx of rollup.contexts) {
    if (ctx.kind === 'check') {
      if (
        ctx.conclusion &&
        CHECK_RUN_FAILURES.has(ctx.conclusion) &&
        ctx.suiteBranch === null
      ) {
        out.push({ name: ctx.name, url: ctx.detailsUrl });
      }
    } else if (STATUS_FAILURES.has(ctx.state)) {
      out.push({ name: ctx.context, url: ctx.targetUrl });
    }
  }
  return out;
}

/**
 * Decides the verdict from the default branch HEAD's rollup and whatever
 * CircleCI told us about the builds behind the unproven reds.
 *
 * `builds` is keyed by the status URL. A URL absent from the map, or mapped to
 * `undefined`, could not be resolved and stays unproven.
 *
 * Returns `undefined` when no CI reports to this branch at all — there is
 * nothing to write, not an unknown to report.
 */
export function verdict(
  rollup: Rollup,
  builds: ReadonlyMap<string, CircleBuild | undefined>,
): Verdict | undefined {
  if (rollup.totalCount === 0 && rollup.contexts.length === 0) {
    return undefined;
  }

  const failing: string[] = [];
  let unproven = 0;

  for (const ctx of rollup.contexts) {
    if (ctx.kind === 'check') {
      if (!ctx.conclusion || !CHECK_RUN_FAILURES.has(ctx.conclusion)) {
        continue;
      }
      if (ctx.suiteBranch === rollup.defaultBranch) {
        failing.push(ctx.name);
      } else if (ctx.suiteBranch === null) {
        // A tag-triggered or fork run on the same SHA. Route it through
        // attribution like a legacy status; most have no CircleCI URL and stay
        // unproven.
        unproven += attribute(ctx.detailsUrl, rollup.defaultBranch, builds)
          ? (failing.push(ctx.name), 0)
          : 1;
      }
      // A failing suite on another branch is not this branch's failure.
      continue;
    }

    if (!STATUS_FAILURES.has(ctx.state)) {
      continue;
    }
    const resolved = attributeStatus(
      ctx.targetUrl,
      rollup.defaultBranch,
      builds,
    );
    if (resolved === 'failing') {
      failing.push(ctx.context);
    } else if (resolved === 'unproven') {
      unproven += 1;
    }
  }

  if (failing.length > 0) {
    return { status: BUILD_FAILING, failingChecks: failing.sort() };
  }
  // A failure past the page boundary would otherwise read as a green branch.
  if (unproven > 0 || rollup.totalCount > rollup.contexts.length) {
    return { status: BUILD_UNKNOWN, failingChecks: [] };
  }
  return { status: BUILD_PASSING, failingChecks: [] };
}

type Attribution = 'failing' | 'elsewhere' | 'unproven';

function attributeStatus(
  url: string | null,
  defaultBranch: string,
  builds: ReadonlyMap<string, CircleBuild | undefined>,
): Attribution {
  const build = url ? builds.get(url) : undefined;
  if (!build) {
    return 'unproven';
  }
  if (CIRCLE_NON_VERDICT.has(build.outcome)) {
    // Superseded, still running, never ran: no verdict on the code.
    return 'elsewhere';
  }
  if (build.branch && build.branch !== defaultBranch) {
    return 'elsewhere';
  }
  if (build.branch === defaultBranch) {
    return 'failing';
  }
  return 'unproven';
}

/** True only when CircleCI confirms the build failed on the default branch. */
function attribute(
  url: string | null,
  defaultBranch: string,
  builds: ReadonlyMap<string, CircleBuild | undefined>,
): boolean {
  return attributeStatus(url, defaultBranch, builds) === 'failing';
}

/**
 * Strict, as in the sibling processors: a slug with extra segments would
 * silently resolve to a different repo, and we would publish a confident
 * verdict about a repo that is not this component.
 */
function parseSlug(slug?: string): { owner: string; repo: string } | undefined {
  if (!slug) {
    return undefined;
  }
  const segments = slug.split('/');
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    return undefined;
  }
  return { owner: segments[0], repo: segments[1] };
}

/**
 * Writes the verdict as a label and the detail as annotations, and merges
 * `BUILD-RED` into the shared flag list when failing.
 *
 * The label is a label because the catalog only filters server-side on labels.
 * The flag list is merged, not overwritten: the catalog importer and
 * `AppReadinessProcessor` write to the same annotation, and processor order is
 * not ours to assume.
 *
 * `checkedAt` is when the lookup actually ran, taken from the cache entry, for
 * the reason documented on `AppReadinessProcessor`: a timestamp that moved on
 * every pass would force a database write, a stitch and a search reindex for
 * every component on every cycle. Omitted when no lookup ran.
 */
function withBuildStatus(
  entity: Entity,
  options: {
    verdict: Verdict;
    defaultBranch?: string;
    checkedAt?: number;
  },
): Entity {
  const { verdict: result, defaultBranch, checkedAt } = options;
  const annotations: Record<string, string> = {
    ...(entity.metadata.annotations ?? {}),
  };
  if (checkedAt !== undefined) {
    annotations[BUILD_STATUS_CHECKED_ANNOTATION] = new Date(
      checkedAt,
    ).toISOString();
  }
  if (defaultBranch) {
    annotations[DEFAULT_BRANCH_ANNOTATION] = defaultBranch;
  }
  if (result.failingChecks.length > 0) {
    annotations[BUILD_FAILING_CHECKS_ANNOTATION] =
      result.failingChecks.join(',');
  }

  if (result.status === BUILD_FAILING) {
    const existing = (annotations[READINESS_FLAGS_ANNOTATION] ?? '')
      .split(',')
      .map(f => f.trim())
      .filter(Boolean);
    annotations[READINESS_FLAGS_ANNOTATION] = Array.from(
      new Set([...existing, FLAG_BUILD_RED]),
    )
      .sort()
      .join(',');
  }

  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      annotations,
      labels: {
        ...(entity.metadata.labels ?? {}),
        [BUILD_STATUS_LABEL]: result.status,
      },
    },
  };
}
