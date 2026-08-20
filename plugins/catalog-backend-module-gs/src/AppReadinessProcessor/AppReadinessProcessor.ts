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
import { NotFoundError } from '@backstage/errors';
import semver from 'semver';
import {
  type ContainerRegistryService,
  containerRegistryServiceRef,
} from '@giantswarm/backstage-plugin-gs-node';
import { parseChartRef } from '@giantswarm/backstage-plugin-gs-common';
import { getLatestStableRelease } from '../util/githubReleases';
import { resolveGithubToken } from '../util/githubToken';

const HELMCHARTS_ANNOTATION = 'giantswarm.io/helmcharts';
const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const RELEASE_TAG_PREFIX_ANNOTATION = 'giantswarm.io/release-tag-prefix';
const READINESS_LABEL = 'giantswarm.io/readiness';
const READINESS_FLAGS_ANNOTATION = 'giantswarm.io/readiness-flags';
const READINESS_CHECKED_ANNOTATION = 'giantswarm.io/readiness-checked';

/**
 * The newest release exists in git but no chart of that version reached the
 * registry, so there is nothing for a HelmRelease to point at.
 */
const FLAG_RELEASE_NOT_PUBLISHED = 'RELEASE-NOT-PUBLISHED';
/** The repo has releases but the chart registry holds no stable version at all. */
const FLAG_NEVER_PUBLISHED = 'NEVER-PUBLISHED';

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

type CacheEntry = {
  /** Highest stable chart version in the registry, or undefined if none. */
  latestStable: string | undefined;
  /** True when the registry could not be read at all. */
  unreadable: boolean;
  fetchedAt: number;
};

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
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: FetchFn;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheEntry>>();

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
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
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

    const release = await this.getLatestRelease(slug);
    if (!release) {
      // No release found, or GitHub could not be asked. Either way we cannot
      // say anything about publication, so we say nothing rather than guessing.
      return withReadiness(entity, { readiness: READINESS_UNKNOWN, flags: [] });
    }

    const entries = await Promise.all(refs.map(ref => this.getCacheEntry(ref)));
    const result = verdict(release.tag, entries);

    // The tag listing is a window (500 newest), so a chart that publishes many
    // CI tags between releases could in principle have its newest stable
    // version fall outside it, which would read as an unpublished release.
    // Before flagging, ask the registry for that exact tag: a point lookup
    // cannot be windowed out. Only the components that would be flagged pay
    // for this — around one in twelve.
    if (
      result.flags.includes(FLAG_RELEASE_NOT_PUBLISHED) &&
      (await this.tagExists(refs, release.tag))
    ) {
      return withReadiness(entity, {
        readiness: READINESS_RELEASABLE,
        flags: [],
      });
    }

    return withReadiness(entity, result);
  }

  /**
   * Reports whether any of the charts carries this exact version. Tries the tag
   * as published (`1.6.0`) as well as verbatim, since a git tag `v1.6.0`
   * publishes without the prefix.
   */
  private async tagExists(
    refs: readonly ChartRef[],
    releaseTag: string,
  ): Promise<boolean> {
    const candidates = Array.from(
      new Set([releaseTag.replace(/^v/, ''), releaseTag]),
    );
    for (const ref of refs) {
      for (const candidate of candidates) {
        try {
          await this.containerRegistry.getTagManifest(
            ref.registry,
            ref.repository,
            candidate,
          );
          return true;
        } catch (error) {
          if (!(error instanceof NotFoundError)) {
            this.logger.debug(
              `AppReadinessProcessor: manifest lookup for ${ref.registry}/${ref.repository}:${candidate} failed: ${error}`,
            );
          }
        }
      }
    }
    return false;
  }

  private async getLatestRelease(slug: { owner: string; repo: string }) {
    const url = `https://github.com/${slug.owner}/${slug.repo}`;
    try {
      const token = await resolveGithubToken({
        url,
        credentialsProvider: this.credentialsProvider,
        integrations: this.integrations,
        logger: this.logger,
      });
      return await getLatestStableRelease({
        owner: slug.owner,
        repo: slug.repo,
        token,
        fetchImpl: this.fetchImpl,
        logger: this.logger,
        label: `AppReadinessProcessor ${slug.owner}/${slug.repo}`,
      });
    } catch (error) {
      this.logger.warn(
        `AppReadinessProcessor: failed to fetch release for ${slug.owner}/${slug.repo}: ${error}`,
      );
      return undefined;
    }
  }

  private async getCacheEntry(ref: ChartRef): Promise<CacheEntry> {
    const key = `${ref.registry}/${ref.repository}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt < this.cacheTtlMs) {
      return cached;
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const fill = this.fillCache(ref)
      .then(partial => {
        const fresh: CacheEntry = { ...partial, fetchedAt: Date.now() };
        this.cache.set(key, fresh);
        return fresh;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, fill);
    return fill;
  }

  private async fillCache(
    ref: ChartRef,
  ): Promise<Omit<CacheEntry, 'fetchedAt'>> {
    try {
      const result = await this.containerRegistry.getTags(
        ref.registry,
        ref.repository,
        { limit: TAGS_FETCH_LIMIT },
      );
      return {
        latestStable: highestStable(result.tags.map(t => t.tag)),
        unreadable: false,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        // The chart repository does not exist in the registry. That is a real
        // answer: nothing was ever published there.
        this.logger.debug(
          `AppReadinessProcessor: chart ${ref.registry}/${ref.repository} not found`,
        );
        return { latestStable: undefined, unreadable: false };
      }
      // A private registry we hold no credentials for, or a transient failure.
      // Either way we do not know.
      this.logger.warn(
        `AppReadinessProcessor: failed to fetch tags for ${ref.registry}/${ref.repository}: ${error}`,
      );
      return { latestStable: undefined, unreadable: true };
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
  entries: ReadonlyArray<Pick<CacheEntry, 'latestStable' | 'unreadable'>>,
): Verdict {
  if (entries.length === 0 || entries.every(e => e.unreadable)) {
    return { readiness: READINESS_UNKNOWN, flags: [] };
  }

  const release = semver.parse(releaseTag);
  if (!release) {
    // A release tag we cannot compare — a date, a monorepo prefix, a codename.
    return { readiness: READINESS_UNKNOWN, flags: [] };
  }

  const published = highestStable(
    entries.map(e => e.latestStable).filter((v): v is string => Boolean(v)),
  );

  if (!published) {
    return {
      readiness: READINESS_BLOCKED,
      flags: [FLAG_NEVER_PUBLISHED],
    };
  }

  // The git tag `v1.6.0` publishes as chart tag `1.6.0`; semver.parse drops the
  // prefix, so the comparison needs no special case.
  if (semver.gt(release, semver.parse(published)!)) {
    return {
      readiness: READINESS_BLOCKED,
      flags: [FLAG_RELEASE_NOT_PUBLISHED],
    };
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

function parseSlug(slug?: string): { owner: string; repo: string } | undefined {
  if (!slug) {
    return undefined;
  }
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) {
    return undefined;
  }
  return { owner, repo };
}

/**
 * Writes the verdict as a label and the detail as annotations.
 *
 * The verdict is a label because the Backstage catalog only filters
 * server-side on labels. Flags merge with whatever the catalog importer already
 * published there, so the release verdict and the chart-metadata verdict share
 * one list rather than competing for the same key.
 */
function withReadiness(entity: Entity, result: Verdict): Entity {
  const annotations: Record<string, string> = {
    ...(entity.metadata.annotations ?? {}),
    [READINESS_CHECKED_ANNOTATION]: new Date().toISOString(),
  };

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
