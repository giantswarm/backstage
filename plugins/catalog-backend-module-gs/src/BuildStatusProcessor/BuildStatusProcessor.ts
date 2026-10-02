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
/**
 * How long a verdict is served while lookups fail. Past this, a lost GitHub
 * App grant or a long outage reads as `unknown` rather than as an old
 * `passing` that nothing verifies any more.
 */
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
// GitHub caps `contexts(first:)` at 100. Anything past it is invisible to us,
// and a failure past the page boundary must not read as a green branch.
const CONTEXTS_PAGE_SIZE = 100;

/**
 * Any CircleCI link: a v1.1 build URL in a status, or an app.circleci.com
 * pipeline link in a CircleCI check run's `detailsUrl`. Marks a context as
 * coming from the build rather than from a lint or scorecard workflow.
 */
const CIRCLE_ANY = /^https:\/\/(app\.)?circleci\.com\//;

/** A CircleCI build URL as GitHub stores it in a status `targetUrl`. */
const CIRCLE_BUILD = /circleci\.com\/(gh|bb)\/([^/]+)\/([^/]+)\/(\d+)/;

/**
 * CircleCI build outcomes that are not a verdict on the code yet: still
 * running, superseded, never run. On the default branch that leaves the branch
 * unproven — it is not a failure, and it is not a pass either.
 */
const CIRCLE_NON_VERDICT = new Set([
  'canceled',
  'cancelled',
  'not_run',
  'queued',
  'running',
  'retried',
  'not_running',
  'scheduled',
  'on_hold',
  // No status or outcome in the answer at all: nothing to call a verdict.
  '',
]);

const CHECK_RUN_FAILURES = new Set(['FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE']);
/**
 * Check run conclusions that are not a failure and need no verdict: `SUCCESS`
 * is evidence the branch builds; `NEUTRAL` and `SKIPPED` (a path filter, an
 * `if:`) are neither evidence nor unproven. Anything else that is not a
 * failure — still running (`null`), `CANCELLED`, `STALE`, `ACTION_REQUIRED` —
 * has not reached a verdict, and on the default branch leaves it unproven.
 */
const CHECK_RUN_GREEN = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const CHECK_RUN_EVIDENCE = 'SUCCESS';
const STATUS_FAILURES = new Set(['FAILURE', 'ERROR']);
const STATUS_GREEN = 'SUCCESS';

/** GraphQL error types that mean this repo cannot be read, not that GitHub failed. */
const UNREADABLE_REPO = new Set(['NOT_FOUND', 'FORBIDDEN']);

/** CircleCI answers that are worth asking again next pass, not caching. */
const CIRCLE_TRANSIENT = (status: number) => status === 429 || status >= 500;

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
  /** Set for a tag build, which has no branch. */
  tag?: string | null;
  /** `status` or `outcome`, lowercased. */
  outcome: string;
};

/**
 * A context that is not green and that GitHub alone cannot pin to the default
 * branch, so CircleCI is asked about it.
 */
type Unsettled = { name: string; url: string | null };

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

/**
 * No GitHub token resolves for this repo's owner. A configuration gap, not a
 * fact about the build: the entity is left alone, and the gap is warned about
 * once per owner rather than once per entity per pass.
 */
class NoGithubTokenError extends Error {}

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
   * The last lookup that succeeded per `owner/repo`, served when a lookup
   * fails: a GitHub 5xx or a CircleCI rate limit says nothing about the build,
   * and writing `unknown` for it would flip every affected component for a
   * pass. Its `checkedAt` shows how old it is. Bounded by the fleet's size.
   */
  private readonly lastKnown = new Map<string, Cached<BuildLookup>>();
  /** Owners already warned about for having no GitHub token. */
  private readonly ownersWithoutToken = new Set<string>();

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

    const key = `${slug.owner}/${slug.repo}`;
    let lookup: Cached<BuildLookup>;
    try {
      lookup = await this.lookupCache.get(key, () => this.lookup(slug));
      this.lastKnown.set(key, lookup);
    } catch (error) {
      if (error instanceof NoGithubTokenError) {
        // Writing `unknown` here would turn the Build column to Unknown for
        // every repo of an owner the GitHub App cannot see.
        if (!this.ownersWithoutToken.has(slug.owner)) {
          this.ownersWithoutToken.add(slug.owner);
          this.logger.warn('BuildStatusProcessor: no GitHub token for owner', {
            owner: slug.owner,
          });
        }
        return entity;
      }
      // GitHub or CircleCI could not be asked. A rejected lookup is not
      // cached, so this is retried next pass. Static message, identifiers in
      // metadata: a rate-limit episode hits every repo at once, and Sentry
      // fingerprints on the message.
      this.logger.warn('BuildStatusProcessor: status lookup failed', {
        owner: slug.owner,
        repo: slug.repo,
        error: String(error),
      });
      const previous = this.lastKnown.get(key);
      if (
        !previous ||
        Date.now() - previous.fetchedAt > LAST_KNOWN_MAX_AGE_MS
      ) {
        return withBuildStatus(entity, {
          verdict: { status: BUILD_UNKNOWN, failingChecks: [] },
        });
      }
      lookup = previous;
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

    const urls = unsettled(rollup)
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
      throw new NoGithubTokenError('no GitHub token available for GraphQL');
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
    const unreadable = body.errors?.find(e =>
      UNREADABLE_REPO.has(e.type ?? ''),
    );
    if (unreadable) {
      // Renamed, archived away, or outside the GitHub App's installation
      // (`FORBIDDEN`, "Resource not accessible by integration"): a stale slug
      // or a deliberate scope, not a fault. Resolves (and so is cached) as
      // "nothing to say".
      this.logger.debug('BuildStatusProcessor: repository not readable', {
        owner: slug.owner,
        repo: slug.repo,
        type: unreadable.type,
      });
      return undefined;
    }
    if (body.errors?.length) {
      throw new Error(
        `GitHub GraphQL errors: ${body.errors.map(e => e.message).join('; ')}`,
      );
    }
    return parseRollup(body);
  }

  /**
   * Not cached on its own: it only runs inside a lookup, which is. A 429 or a
   * 5xx throws so the whole lookup is rejected, not cached, and retried next
   * pass — resolving it would pin the component at `unknown` for a whole TTL.
   */
  private async resolveCircleBuild(
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
    if (CIRCLE_TRANSIENT(response.status)) {
      throw new Error(`CircleCI returned ${response.status}`);
    }
    if (!response.ok) {
      // Private project without a token, a deleted build: we cannot attribute
      // this context. It stays unproven, and asking again will not change that.
      this.logger.debug('BuildStatusProcessor: CircleCI build not readable', {
        url: api,
        status: response.status,
      });
      return undefined;
    }
    const body = (await response.json()) as {
      branch?: string | null;
      vcs_tag?: string | null;
      status?: string | null;
      outcome?: string | null;
    };
    return {
      branch: body.branch ?? null,
      tag: body.vcs_tag ?? null,
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
  errors?: Array<{ message: string; type?: string }>;
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
 * Contexts that are not green and that GitHub alone cannot pin to the default
 * branch: every legacy status that is not `SUCCESS`, and every check run whose
 * suite has no branch and has not passed. These are the ones CircleCI is asked
 * about.
 */
function unsettled(rollup: Rollup): Unsettled[] {
  const out: Unsettled[] = [];
  for (const ctx of rollup.contexts) {
    if (ctx.kind === 'check') {
      if (
        ctx.suiteBranch === null &&
        !(ctx.conclusion && CHECK_RUN_GREEN.has(ctx.conclusion))
      ) {
        out.push({ name: ctx.name, url: ctx.detailsUrl });
      }
    } else if (ctx.state !== STATUS_GREEN) {
      out.push({ name: ctx.context, url: ctx.targetUrl });
    }
  }
  return out;
}

/**
 * Decides the verdict from the default branch HEAD's rollup and whatever
 * CircleCI told us about the builds behind the unsettled contexts.
 *
 * `builds` is keyed by the status URL. A URL absent from the map, or mapped to
 * `undefined`, could not be resolved and stays unproven.
 *
 * `passing` needs positive evidence: every context in view settled green and
 * at least one of them speaks for the default branch. Where CircleCI reports
 * to the commit at all, that one must be CircleCI's: a green pre-commit or
 * scorecard workflow says nothing about whether the build runs, and with
 * `ignore: main` in the CircleCI config it would otherwise read `passing` for
 * a branch CircleCI never built. Those other contexts can still fail the
 * branch or leave it unproven. Repos without CircleCI take any green check. A context still running,
 * cancelled or otherwise without a verdict leaves the branch unproven, and so
 * does a rollup whose every context was set aside as another branch's or a
 * tag's — that branch may never have been built at all. A green legacy status
 * counts as evidence without asking CircleCI: whichever branch it ran on, it
 * built this very SHA.
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

  const failing = new Set<string>();
  let unproven = 0;
  let evidence = 0;
  let buildEvidence = 0;
  const hasCircle = rollup.contexts.some(ctx =>
    CIRCLE_ANY.test(
      (ctx.kind === 'check' ? ctx.detailsUrl : ctx.targetUrl) ?? '',
    ),
  );

  for (const ctx of rollup.contexts) {
    let attribution: Attribution;
    let name: string;
    if (ctx.kind === 'check') {
      name = ctx.name;
      const green = Boolean(
        ctx.conclusion && CHECK_RUN_GREEN.has(ctx.conclusion),
      );
      if (ctx.suiteBranch === rollup.defaultBranch) {
        if (green) {
          attribution =
            ctx.conclusion === CHECK_RUN_EVIDENCE ? 'green' : 'elsewhere';
        } else if (ctx.conclusion && CHECK_RUN_FAILURES.has(ctx.conclusion)) {
          attribution = 'failing';
        } else {
          attribution = 'unproven';
        }
      } else if (ctx.suiteBranch === null) {
        // A tag-triggered or fork run on the same SHA. A green one says
        // nothing about the default branch; anything else is routed through
        // attribution like a legacy status, and most have no CircleCI URL and
        // stay unproven.
        attribution = green
          ? 'elsewhere'
          : attributeContext(
              ctx.detailsUrl,
              Boolean(ctx.conclusion && CHECK_RUN_FAILURES.has(ctx.conclusion)),
              rollup.defaultBranch,
              builds,
            );
      } else {
        // A suite on another branch is not this branch's result either way.
        attribution = 'elsewhere';
      }
    } else {
      name = ctx.context;
      attribution =
        ctx.state === STATUS_GREEN
          ? 'green'
          : attributeContext(
              ctx.targetUrl,
              STATUS_FAILURES.has(ctx.state),
              rollup.defaultBranch,
              builds,
            );
    }

    if (attribution === 'failing') {
      failing.add(name);
    } else if (attribution === 'unproven') {
      unproven += 1;
    } else if (attribution === 'green') {
      evidence += 1;
      const url = ctx.kind === 'check' ? ctx.detailsUrl : ctx.targetUrl;
      if (CIRCLE_ANY.test(url ?? '')) {
        buildEvidence += 1;
      }
    }
  }

  if (failing.size > 0) {
    return { status: BUILD_FAILING, failingChecks: Array.from(failing).sort() };
  }
  // A failure past the page boundary would otherwise read as a green branch.
  if (
    unproven > 0 ||
    (hasCircle ? buildEvidence : evidence) === 0 ||
    rollup.totalCount > rollup.contexts.length
  ) {
    return { status: BUILD_UNKNOWN, failingChecks: [] };
  }
  return { status: BUILD_PASSING, failingChecks: [] };
}

type Attribution = 'green' | 'failing' | 'elsewhere' | 'unproven';

/**
 * Attributes a context GitHub could not pin to a branch, on CircleCI's word.
 * Only a build CircleCI confirms ran on the default branch can fail it; a tag
 * build or another branch's build is set aside; anything else — no build
 * behind the URL, no branch, a build that has not reached a verdict — is
 * unproven.
 */
function attributeContext(
  url: string | null,
  failed: boolean,
  defaultBranch: string,
  builds: ReadonlyMap<string, CircleBuild | undefined>,
): Attribution {
  const build = url ? builds.get(url) : undefined;
  if (!build) {
    return 'unproven';
  }
  if (build.tag) {
    return 'elsewhere';
  }
  if (build.branch && build.branch !== defaultBranch) {
    return 'elsewhere';
  }
  if (build.branch !== defaultBranch) {
    return 'unproven';
  }
  // On the default branch: only a finished build that GitHub also reports as
  // failed is a failure. A pending status, or one whose build is still
  // running or was cancelled, has no verdict yet.
  if (CIRCLE_NON_VERDICT.has(build.outcome) || !failed) {
    return 'unproven';
  }
  return 'failing';
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
    // A JSON array, not a comma list: check names contain commas, as in a
    // matrix job's `test (ubuntu-latest, 20)`.
    annotations[BUILD_FAILING_CHECKS_ANNOTATION] = JSON.stringify(
      result.failingChecks,
    );
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
