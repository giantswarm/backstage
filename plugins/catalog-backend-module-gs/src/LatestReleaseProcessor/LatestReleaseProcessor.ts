import type { Entity } from '@backstage/catalog-model';
import type {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
} from '@backstage/plugin-catalog-node';
import type { LocationSpec } from '@backstage/plugin-catalog-common';
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import {
  DefaultGithubCredentialsProvider,
  type GithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import {
  getLatestStableRelease,
  type LatestRelease,
  listLatestReleasesByPrefix,
} from '../util/githubReleases';

const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const RELEASE_TAG_PREFIX_ANNOTATION = 'giantswarm.io/release-tag-prefix';
const LATEST_RELEASE_TAG_ANNOTATION = 'giantswarm.io/latest-release-tag';
const LATEST_RELEASE_DATE_ANNOTATION = 'giantswarm.io/latest-release-date';
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry = {
  release: LatestRelease | undefined;
  fetchedAt: number;
};

type FetchFn = typeof fetch;

export class LatestReleaseProcessor implements CatalogProcessor {
  private readonly logger: LoggerService;
  private readonly credentialsProvider: GithubCredentialsProvider;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: FetchFn;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheEntry>>();

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    fetchImpl?: FetchFn;
  }): LatestReleaseProcessor {
    const { config, logger, fetchImpl } = options;
    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    const cacheTtlSeconds = config.getOptionalNumber(
      'catalog.processors.latestRelease.cacheTtlSeconds',
    );
    return new LatestReleaseProcessor({
      logger,
      credentialsProvider,
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
    cacheTtlMs?: number;
    fetchImpl?: FetchFn;
  }) {
    this.logger = options.logger;
    this.credentialsProvider = options.credentialsProvider;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getProcessorName(): string {
    return 'LatestReleaseProcessor';
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
    const slug = annotations[PROJECT_SLUG_ANNOTATION];
    if (!slug) {
      return entity;
    }
    const parsed = parseSlug(slug);
    if (!parsed) {
      return entity;
    }
    const prefix = annotations[RELEASE_TAG_PREFIX_ANNOTATION];

    let entry: CacheEntry;
    try {
      entry = await this.getCacheEntry(parsed.owner, parsed.repo, prefix);
    } catch (error) {
      this.logger.warn(
        `LatestReleaseProcessor: failed to fetch release for ${slug}${
          prefix ? ` (prefix "${prefix}")` : ''
        }: ${error}`,
      );
      return entity;
    }

    if (!entry.release) {
      return entity;
    }

    return withReleaseAnnotations(entity, entry.release);
  }

  private async getCacheEntry(
    owner: string,
    repo: string,
    prefix: string | undefined,
  ): Promise<CacheEntry> {
    const key = `${owner}/${repo}|${prefix ?? ''}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt < this.cacheTtlMs) {
      return cached;
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const fill = this.fillCache(owner, repo, prefix)
      .then(release => {
        const fresh: CacheEntry = { release, fetchedAt: Date.now() };
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
    owner: string,
    repo: string,
    prefix: string | undefined,
  ): Promise<LatestRelease | undefined> {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const { token } = await this.credentialsProvider.getCredentials({
      url: repoUrl,
    });
    if (!token) {
      throw new Error(`No GitHub credentials for ${repoUrl}`);
    }
    const label = `LatestReleaseProcessor: ${owner}/${repo}${
      prefix ? ` prefix=${prefix}` : ''
    }`;
    if (prefix) {
      const map = await listLatestReleasesByPrefix({
        owner,
        repo,
        prefixes: [prefix],
        token,
        fetchImpl: this.fetchImpl,
        logger: this.logger,
        label,
      });
      return map.get(prefix);
    }
    return getLatestStableRelease({
      owner,
      repo,
      token,
      fetchImpl: this.fetchImpl,
      logger: this.logger,
      label,
    });
  }
}

function parseSlug(slug: string): { owner: string; repo: string } | undefined {
  const segments = slug.split('/');
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    return undefined;
  }
  return { owner: segments[0], repo: segments[1] };
}

function withReleaseAnnotations(
  entity: Entity,
  release: LatestRelease,
): Entity {
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      annotations: {
        ...(entity.metadata.annotations ?? {}),
        [LATEST_RELEASE_TAG_ANNOTATION]: release.tag,
        [LATEST_RELEASE_DATE_ANNOTATION]: release.publishedAt,
      },
    },
  };
}
