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
import {
  AuthenticationError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import semver from 'semver';
import {
  type ContainerRegistryService,
  containerRegistryServiceRef,
} from '@giantswarm/backstage-plugin-gs-node';
import {
  parseChartRef,
  ReleaseReadinessFlags,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  getLatestStableRelease,
  type LatestRelease,
} from '../util/githubReleases';
import { resolveGithubToken } from '../util/githubToken';
import { type Cached, TtlCache } from '../util/TtlCache';

// Re-exported for callers that reached the cache through this module.
export { TtlCache } from '../util/TtlCache';

const HELMCHARTS_ANNOTATION = 'giantswarm.io/helmcharts';
const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const RELEASE_TAG_PREFIX_ANNOTATION = 'giantswarm.io/release-tag-prefix';
const READINESS_LABEL = 'giantswarm.io/readiness';
const READINESS_FLAGS_ANNOTATION = 'giantswarm.io/readiness-flags';
const READINESS_CHECKED_ANNOTATION = 'giantswarm.io/readiness-checked';

/**
 * The newest release exists in git but no chart of that version reached the
 * registry, so there is nothing for a HelmRelease to point at.
 *
 * The names of both blockers live in gs-common, because the devportal has to
 * recognise them to tell them apart from the chart-metadata gaps the catalog
 * importer merges into the same annotation. A blocker added here alone would be
 * rendered there as a chart-metadata gap.
 */
const FLAG_RELEASE_NOT_PUBLISHED = ReleaseReadinessFlags.releaseNotPublished;
/**
 * The repo has releases but the chart registry holds no stable version at all.
 *
 * This is the stronger of the two claims — consumers render it as "only dev
 * builds from branches" — so it is only used when the tag listing was complete.
 * A truncated listing cannot rule out an older stable version outside the
 * window, so it reports FLAG_RELEASE_NOT_PUBLISHED instead, which is true of
 * both states.
 */
const FLAG_NEVER_PUBLISHED = ReleaseReadinessFlags.neverPublished;

/**
 * Readiness verdicts. `unknown` is a first-class outcome, not an absence: a
 * chart we could not resolve or a registry we could not read must never be
 * reported as blocked.
 */
export const READINESS_RELEASABLE = 'releasable';
export const READINESS_BLOCKED = 'blocked';
export const READINESS_UNKNOWN = 'unknown';

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
// Matches LatestOciReleaseProcessor: ACR pages at 500, and charts that publish
// many CI tags between releases need a wide window to keep the latest stable in
// view.
const TAGS_FETCH_LIMIT = 500;

type ChartRef = {
  registry: string;
  repository: string;
};

type ChartState = {
  /** Highest stable chart version in the registry, or undefined if none. */
  latestStable: string | undefined;
  /** True when the registry could not be read at all. */
  unreadable: boolean;
  /**
   * True when the tag listing came back at the fetch limit, so there may be
   * more tags than we saw. "No stable version at all" is not claimable from a
   * truncated listing.
   */
  truncated: boolean;
};

/**
 * Outcome of asking the registry for one exact tag. Three-state on purpose:
 * only a 404 means the tag is absent. A 401 from a private registry, a 429 or a
 * 5xx says we could not find out, which must never read as a blocker.
 */
type TagLookup = 'present' | 'absent' | 'inconclusive';

type Verdict = {
  readiness: string;
  flags: string[];
};

type FetchFn = typeof fetch;

/**
 * Annotates Component entities carrying `giantswarm.io/helmcharts` with whether
 * their newest release actually reached the chart registry.
 *
 * This is the release precondition for the HelmRelease migration: a chart that
 * was never published has nothing for a HelmRelease to point at, however
 * healthy the repo looks. `resource-police` is the worked example — released on
 * an architect orb that predated OCI chart push, so no chart version ever
 * reached the registry from CI, which blocked its migration for months while
 * nothing anywhere said so.
 *
 * Deliberately narrow. Build status is not checked (attributing a status to a
 * branch needs the CI-side build, since GitHub hangs statuses off a SHA), and
 * neither is chart metadata compliance, which the catalog importer already
 * publishes.
 */
export class AppReadinessProcessor implements CatalogProcessor {
  private readonly logger: LoggerService;
  private readonly containerRegistry: Pick<
    ContainerRegistryService,
    'getTags' | 'getTagManifest'
  >;
  private readonly credentialsProvider: GithubCredentialsProvider;
  private readonly integrations: ScmIntegrationRegistry;
  private readonly fetchImpl: FetchFn;
  /** Highest published chart version, keyed `registry/repository`. */
  private readonly chartCache: TtlCache<ChartState>;
  /**
   * `/releases/latest`, keyed `owner/repo`. Without this the lookup would run
   * once per component per processing cycle. The sibling LatestReleaseProcessor
   * caches the same call behind the same TTL; the two caches are not shared, so
   * a repo is asked at most once per TTL per processor.
   */
  private readonly releaseCache: TtlCache<LatestRelease | undefined>;
  /**
   * Presence of one exact chart tag, keyed `registry/repository:tag`. Only the
   * components that would be flagged reach this, but without a cache they would
   * re-ask on every processing cycle — the traffic pattern that earns a 429.
   */
  private readonly tagCache: TtlCache<TagLookup>;

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    containerRegistry: typeof containerRegistryServiceRef.T;
    fetchImpl?: FetchFn;
  }): AppReadinessProcessor {
    const { config, logger, containerRegistry, fetchImpl } = options;
    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    const cacheTtlSeconds = config.getOptionalNumber(
      'catalog.processors.appReadiness.cacheTtlSeconds',
    );
    return new AppReadinessProcessor({
      logger,
      containerRegistry,
      credentialsProvider,
      integrations,
      cacheTtlMs:
        cacheTtlSeconds !== undefined
          ? cacheTtlSeconds * 1000
          : DEFAULT_CACHE_TTL_MS,
      fetchImpl,
    });
  }

  constructor(options: {
    logger: LoggerService;
    containerRegistry: Pick<
      ContainerRegistryService,
      'getTags' | 'getTagManifest'
    >;
    credentialsProvider: GithubCredentialsProvider;
    integrations: ScmIntegrationRegistry;
    cacheTtlMs?: number;
    fetchImpl?: FetchFn;
  }) {
    this.logger = options.logger;
    this.containerRegistry = options.containerRegistry;
    this.credentialsProvider = options.credentialsProvider;
    this.integrations = options.integrations;
    this.fetchImpl = options.fetchImpl ?? fetch;
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.chartCache = new TtlCache(cacheTtlMs);
    this.releaseCache = new TtlCache(cacheTtlMs);
    this.tagCache = new TtlCache(cacheTtlMs);
  }

  getProcessorName(): string {
    return 'AppReadinessProcessor';
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

    const annotations = entity.metadata.annotations ?? {};
    const refs = parseHelmChartsAnnotation(entity);
    const slug = parseSlug(annotations[PROJECT_SLUG_ANNOTATION]);
    if (refs.length === 0 || !slug) {
      return entity;
    }

    // In a monorepo, `/releases/latest` returns whichever component released
    // most recently, which says nothing about this one. Comparing that against
    // a chart version would invent blockers, so these report unknown.
    if (annotations[RELEASE_TAG_PREFIX_ANNOTATION]) {
      return withReadiness(entity, { readiness: READINESS_UNKNOWN, flags: [] });
    }

    let release: Cached<LatestRelease | undefined>;
    try {
      release = await this.getLatestRelease(slug);
    } catch (error) {
      // GitHub could not be asked, so we cannot say anything about publication.
      // Static message, identifiers in metadata: a GitHub rate-limit episode
      // hits every repo at once, and Sentry fingerprints on the message.
      this.logger.warn('AppReadinessProcessor: release lookup failed', {
        owner: slug.owner,
        repo: slug.repo,
        error: String(error),
      });
      return withReadiness(entity, { readiness: READINESS_UNKNOWN, flags: [] });
    }
    if (!release.value) {
      // The repo has no stable release, so there is nothing to expect in the
      // registry. We say nothing rather than guessing.
      return withReadiness(
        entity,
        { readiness: READINESS_UNKNOWN, flags: [] },
        release.fetchedAt,
      );
    }
    const releaseTag = release.value.tag;

    const charts = await Promise.all(refs.map(ref => this.getChartState(ref)));
    const result = verdict(
      releaseTag,
      charts.map(chart => chart.value),
    );
    const checkedAt = Math.max(
      release.fetchedAt,
      ...charts.map(chart => chart.fetchedAt),
    );

    // The tag listing is a window (500 newest, timedesc), so a chart that
    // publishes many CI tags between releases can have its newest stable
    // version fall outside it — reading either as an unpublished release or, if
    // every tag in the window is a dev build, as never published at all. Both
    // blockers are therefore confirmed by asking the registry for that exact
    // tag, which cannot be windowed out. Only the components that would be
    // flagged pay for it, and the answer is cached like every other lookup.
    if (result.readiness === READINESS_BLOCKED) {
      const confirmation = await this.confirmTag(refs, releaseTag);
      if (confirmation === 'present') {
        return withReadiness(
          entity,
          { readiness: READINESS_RELEASABLE, flags: [] },
          checkedAt,
        );
      }
      if (confirmation === 'inconclusive') {
        // The registry would not tell us. A wrong blocker on someone else's app
        // is worse than no verdict.
        return withReadiness(
          entity,
          { readiness: READINESS_UNKNOWN, flags: [] },
          checkedAt,
        );
      }
    }

    return withReadiness(entity, result, checkedAt);
  }

  /**
   * Reports whether any of the charts carries this exact version. Tries the tag
   * as published (`1.6.0`) as well as verbatim, since a git tag `v1.6.0`
   * publishes without the prefix.
   *
   * `absent` is claimed only when every lookup came back a definite 404. If any
   * of them could not be answered the result is `inconclusive`, so an expired
   * credential or a rate-limited registry cannot turn into a blocker.
   */
  private async confirmTag(
    refs: readonly ChartRef[],
    releaseTag: string,
  ): Promise<TagLookup> {
    const candidates = Array.from(
      new Set([releaseTag.replace(/^v/, ''), releaseTag]),
    );
    let inconclusive = false;
    for (const ref of refs) {
      for (const candidate of candidates) {
        const lookup = await this.lookupTag(ref, candidate);
        if (lookup === 'present') {
          return 'present';
        }
        if (lookup === 'inconclusive') {
          inconclusive = true;
        }
      }
    }
    return inconclusive ? 'inconclusive' : 'absent';
  }

  private async lookupTag(ref: ChartRef, tag: string): Promise<TagLookup> {
    const key = `${ref.registry}/${ref.repository}:${tag}`;
    // fetchTag rethrows anything that is not an answer, and TtlCache does not
    // cache a rejected fill, so an inconclusive lookup is retried next pass.
    const cached = await this.tagCache
      .get(key, () => this.fetchTag(ref, tag))
      .catch(() => undefined);
    return cached?.value ?? 'inconclusive';
  }

  private async fetchTag(ref: ChartRef, tag: string): Promise<TagLookup> {
    try {
      await this.containerRegistry.getTagManifest(
        ref.registry,
        ref.repository,
        tag,
      );
      return 'present';
    } catch (error) {
      if (error instanceof NotFoundError) {
        return 'absent';
      }
      this.logger.debug(
        'AppReadinessProcessor: manifest lookup could not be answered',
        {
          registry: ref.registry,
          repository: ref.repository,
          tag,
          error: String(error),
        },
      );
      throw error;
    }
  }

  private getLatestRelease(slug: {
    owner: string;
    repo: string;
  }): Promise<Cached<LatestRelease | undefined>> {
    return this.releaseCache.get(`${slug.owner}/${slug.repo}`, () =>
      this.fetchLatestRelease(slug),
    );
  }

  private async fetchLatestRelease(slug: {
    owner: string;
    repo: string;
  }): Promise<LatestRelease | undefined> {
    const url = `https://github.com/${slug.owner}/${slug.repo}`;
    const token = await resolveGithubToken({
      url,
      credentialsProvider: this.credentialsProvider,
      integrations: this.integrations,
      logger: this.logger,
    });
    return getLatestStableRelease({
      owner: slug.owner,
      repo: slug.repo,
      token,
      fetchImpl: this.fetchImpl,
      logger: this.logger,
      label: `AppReadinessProcessor ${slug.owner}/${slug.repo}`,
    });
  }

  private getChartState(ref: ChartRef): Promise<Cached<ChartState>> {
    return this.chartCache.get(`${ref.registry}/${ref.repository}`, () =>
      this.fetchChartState(ref),
    );
  }

  private async fetchChartState(ref: ChartRef): Promise<ChartState> {
    try {
      const result = await this.containerRegistry.getTags(
        ref.registry,
        ref.repository,
        { limit: TAGS_FETCH_LIMIT },
      );
      return {
        latestStable: highestStable(result.tags.map(t => t.tag)),
        unreadable: false,
        // ACR pages at the limit we ask for (the OCI path ignores it and
        // returns everything), so a full page means we may not have seen
        // every tag.
        truncated: result.tags.length >= TAGS_FETCH_LIMIT,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        // The chart repository does not exist in the registry. That is a real
        // answer: nothing was ever published there.
        this.logger.debug('AppReadinessProcessor: chart not found', {
          registry: ref.registry,
          repository: ref.repository,
        });
        return { latestStable: undefined, unreadable: false, truncated: false };
      }
      // A private registry we hold no credentials for, or a transient failure.
      // Either way we do not know.
      //
      // The root logger forwards every warn to Sentry and fingerprints on the
      // message, so an expected, fully-handled outcome stays at debug and the
      // chart identifiers ride in metadata rather than fanning one root cause
      // out into one issue per chart.
      if (
        error instanceof AuthenticationError ||
        error instanceof NotAllowedError
      ) {
        this.logger.debug(
          'AppReadinessProcessor: no access to chart registry, reporting unknown',
          { registry: ref.registry, repository: ref.repository },
        );
      } else {
        this.logger.warn('AppReadinessProcessor: chart tag listing failed', {
          registry: ref.registry,
          repository: ref.repository,
          error: String(error),
        });
      }
      return { latestStable: undefined, unreadable: true, truncated: false };
    }
  }
}

/**
 * Decides the verdict from the newest git release and what the registries hold.
 *
 * For a multi-chart component the highest stable version across all its charts
 * is compared, which is the lenient reading: charts in one repo are versioned
 * independently, so requiring every one of them to match the repo's release tag
 * would flag normal repos.
 */
export function verdict(
  releaseTag: string,
  entries: ReadonlyArray<ChartState>,
): Verdict {
  if (entries.length === 0 || entries.every(e => e.unreadable)) {
    return { readiness: READINESS_UNKNOWN, flags: [] };
  }

  const release = semver.parse(releaseTag);
  if (!release) {
    // A release tag we cannot compare — a date, a monorepo prefix, a codename.
    return { readiness: READINESS_UNKNOWN, flags: [] };
  }

  // GitHub's `/releases/latest` returns the newest release not *flagged* as a
  // prerelease, which says nothing about the tag: `v1.0.0-beta.3` published
  // without `--prerelease` comes back as the latest. highestStable excludes
  // prerelease chart tags, so comparing the two would report a component whose
  // only published charts are prerelease-versioned as never published.
  if (release.prerelease.length > 0) {
    return { readiness: READINESS_UNKNOWN, flags: [] };
  }

  const published = highestStable(
    entries.map(e => e.latestStable).filter((v): v is string => Boolean(v)),
  );

  // A registry we could not read might hold the release, so a blocker is not
  // ours to claim: a public chart at 1.5.0 next to a private gsociprivate chart
  // we get a 401 for says nothing about whether 1.6.0 was published. Only a
  // positive answer — a published version at least as new as the release — can
  // be trusted when part of the picture is missing.
  const blocked = (flag: string): Verdict =>
    entries.some(e => e.unreadable)
      ? { readiness: READINESS_UNKNOWN, flags: [] }
      : { readiness: READINESS_BLOCKED, flags: [flag] };

  if (!published) {
    // Which blocker applies depends on whether we saw the whole listing. With a
    // truncated one, an older stable version may sit outside the window: the
    // release is still absent, so `blocked` is right, but "no stable version at
    // all" would be a false statement about the chart.
    return blocked(
      entries.some(e => e.truncated)
        ? FLAG_RELEASE_NOT_PUBLISHED
        : FLAG_NEVER_PUBLISHED,
    );
  }

  // The git tag `v1.6.0` publishes as chart tag `1.6.0`; semver.parse drops the
  // prefix, so the comparison needs no special case.
  if (semver.gt(release, semver.parse(published)!)) {
    return blocked(FLAG_RELEASE_NOT_PUBLISHED);
  }

  return { readiness: READINESS_RELEASABLE, flags: [] };
}

/**
 * Returns the highest stable semver among the given tags, ignoring prereleases
 * and anything unparseable — which includes `artifacthub.io`, the metadata
 * artifact that ACR lists as a tag, and the `-dev.` tags branch builds push to
 * the same repository.
 *
 * Sort order is not assumed: the OCI path returns tags in whatever order the
 * registry gives them.
 */
export function highestStable(tags: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const tag of tags) {
    const parsed = semver.parse(tag);
    if (!parsed || parsed.prerelease.length > 0) {
      continue;
    }
    if (!best || semver.gt(parsed, semver.parse(best)!)) {
      best = tag;
    }
  }
  return best;
}

function parseHelmChartsAnnotation(entity: Entity): ChartRef[] {
  const raw = entity.metadata.annotations?.[HELMCHARTS_ANNOTATION];
  if (!raw) {
    return [];
  }
  const refs: ChartRef[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // Some registry entries still carry an unsubstituted template
    // placeholder, e.g. charts/giantswarm/{MCP-NAME}. That is not a chart.
    if (trimmed.includes('{') || trimmed.includes('}')) continue;
    const parsed = parseChartRef(trimmed);
    if (!parsed.registry || !parsed.repository) continue;
    refs.push({ registry: parsed.registry, repository: parsed.repository });
  }
  return refs;
}

/**
 * Strict, as in the sibling processors: a slug with extra segments — a pasted
 * URL path like `giantswarm/my-repo/tree/main`, or `giantswarm/sub/repo` —
 * would otherwise silently resolve to a different repo, and we would publish a
 * confident verdict derived from a repo that is not this component. No verdict
 * beats a wrong one.
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
 * Writes the verdict as a label and the detail as annotations.
 *
 * The verdict is a label because the Backstage catalog only filters
 * server-side on labels. This label covers release readiness only, and is ours
 * alone: the catalog importer publishes its chart-metadata verdict under its
 * own `giantswarm.io/readiness-standards` label. What the two do share is the
 * flag list, so flags merge here rather than overwriting what the importer
 * already published under the same key.
 *
 * `checkedAt` is when the underlying lookups ran, not now. The catalog engine
 * skips the database write when a processed entity hashes to the same value as
 * last time (DefaultCatalogProcessingEngine.markSuccessfulWithNoChanges), so a
 * timestamp that moved on every pass would force a write, a stitch, an
 * entity-changed event and a search reindex for every chart-bearing component
 * on every cycle, forever. Taken from the cache entries, it only moves when a
 * lookup actually re-ran. Omitted when no lookup ran at all.
 */
function withReadiness(
  entity: Entity,
  result: Verdict,
  checkedAt?: number,
): Entity {
  const annotations: Record<string, string> = {
    ...(entity.metadata.annotations ?? {}),
  };
  if (checkedAt !== undefined) {
    annotations[READINESS_CHECKED_ANNOTATION] = new Date(
      checkedAt,
    ).toISOString();
  }

  const existing = (annotations[READINESS_FLAGS_ANNOTATION] ?? '')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);
  const merged = Array.from(new Set([...existing, ...result.flags])).sort();
  if (merged.length > 0) {
    annotations[READINESS_FLAGS_ANNOTATION] = merged.join(',');
  }

  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      annotations,
      labels: {
        ...(entity.metadata.labels ?? {}),
        [READINESS_LABEL]: result.readiness,
      },
    },
  };
}
