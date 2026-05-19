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
import { NotFoundError } from '@backstage/errors';
import semver from 'semver';
import {
  type ContainerRegistryService,
  containerRegistryServiceRef,
} from '@giantswarm/backstage-plugin-gs-node';
import { parseChartRef } from '@giantswarm/backstage-plugin-gs-common';

const HELMCHARTS_ANNOTATION = 'giantswarm.io/helmcharts';
const LATEST_RELEASE_TAG_ANNOTATION = 'giantswarm.io/latest-release-tag';
const LATEST_RELEASE_DATE_ANNOTATION = 'giantswarm.io/latest-release-date';
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
// ACR `/acr/v1/<repo>/_tags` returns at most 500 entries per page. Some
// charts publish many prerelease/CI tags between stable releases, so we
// fetch a large window to keep the latest stable inside it.
const TAGS_FETCH_LIMIT = 500;

type ChartRef = {
  registry: string;
  repository: string;
};

type Winner = {
  tag: string;
  createdAt: string | null;
};

type CacheEntry = {
  winner: Winner | undefined;
  fetchedAt: number;
};

export class LatestOciReleaseProcessor implements CatalogProcessor {
  private readonly logger: LoggerService;
  private readonly containerRegistry: Pick<ContainerRegistryService, 'getTags'>;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheEntry>>();

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    containerRegistry: typeof containerRegistryServiceRef.T;
  }): LatestOciReleaseProcessor {
    const { config, logger, containerRegistry } = options;
    const cacheTtlSeconds = config.getOptionalNumber(
      'catalog.processors.latestOciRelease.cacheTtlSeconds',
    );
    return new LatestOciReleaseProcessor({
      logger,
      containerRegistry,
      cacheTtlMs:
        cacheTtlSeconds !== undefined
          ? cacheTtlSeconds * 1000
          : DEFAULT_CACHE_TTL_MS,
    });
  }

  constructor(options: {
    logger: LoggerService;
    containerRegistry: Pick<ContainerRegistryService, 'getTags'>;
    cacheTtlMs?: number;
  }) {
    this.logger = options.logger;
    this.containerRegistry = options.containerRegistry;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  getProcessorName(): string {
    return 'LatestOciReleaseProcessor';
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
    const refs = parseHelmChartsAnnotation(entity);
    if (refs.length === 0) {
      return entity;
    }

    const perRef = await Promise.all(
      refs.map(async ref => {
        try {
          const entry = await this.getCacheEntry(ref);
          return entry.winner;
        } catch (error) {
          if (error instanceof NotFoundError) {
            this.logger.debug(
              `LatestOciReleaseProcessor: chart ${ref.registry}/${ref.repository} not found, skipping`,
            );
          } else {
            this.logger.warn(
              `LatestOciReleaseProcessor: failed to fetch tags for ${ref.registry}/${ref.repository}: ${error}`,
            );
          }
          return undefined;
        }
      }),
    );

    const winner = pickHighestSemver(perRef);
    if (!winner) {
      return entity;
    }
    return withReleaseAnnotations(entity, winner);
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
      .then(winner => {
        const fresh: CacheEntry = { winner, fetchedAt: Date.now() };
        this.cache.set(key, fresh);
        return fresh;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, fill);
    return fill;
  }

  private async fillCache(ref: ChartRef): Promise<Winner | undefined> {
    const result = await this.containerRegistry.getTags(
      ref.registry,
      ref.repository,
      { limit: TAGS_FETCH_LIMIT },
    );
    const stable = result.tags.find(t => {
      const parsed = semver.parse(t.tag);
      return parsed !== null && parsed.prerelease.length === 0;
    });
    if (!stable) {
      this.logger.debug(
        `LatestOciReleaseProcessor: no stable release found for ${ref.registry}/${ref.repository} within the latest ${TAGS_FETCH_LIMIT} tags, skipping`,
      );
      return undefined;
    }
    return { tag: stable.tag, createdAt: stable.createdAt ?? null };
  }
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
    const parsed = parseChartRef(trimmed);
    if (!parsed.registry || !parsed.repository) continue;
    refs.push({ registry: parsed.registry, repository: parsed.repository });
  }
  return refs;
}

function pickHighestSemver(
  candidates: ReadonlyArray<Winner | undefined>,
): Winner | undefined {
  let best: Winner | undefined;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!best) {
      best = candidate;
      continue;
    }
    if (semver.rcompare(candidate.tag, best.tag) < 0) {
      best = candidate;
    }
  }
  return best;
}

function withReleaseAnnotations(entity: Entity, winner: Winner): Entity {
  const next: Record<string, string> = {
    ...(entity.metadata.annotations ?? {}),
    [LATEST_RELEASE_TAG_ANNOTATION]: winner.tag,
  };
  if (winner.createdAt) {
    next[LATEST_RELEASE_DATE_ANNOTATION] = winner.createdAt;
  } else {
    delete next[LATEST_RELEASE_DATE_ANNOTATION];
  }
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      annotations: next,
    },
  };
}
