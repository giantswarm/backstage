import type { Entity } from '@backstage/catalog-model';
import { parseEntityRef } from '@backstage/catalog-model';
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

const SERVICE_ID_ANNOTATION = 'pagerduty.com/service-id';
const USER_ID_ANNOTATION = 'pagerduty.com/user-id';
const TEAM_NAME_PREFIX = 'team-';
const SERVICE_NAME_SUFFIX = '-alertmanager';
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const PD_PAGE_LIMIT = 100;

type PagerDutyService = { id: string; name: string };
type PagerDutyUser = { id: string; email?: string };

type PdCache = {
  servicesByName: Map<string, string>;
  userIdsByEmail: Map<string, string>;
  fetchedAt: number;
};

type FetchFn = typeof fetch;

export class PagerDutyAnnotationProcessor implements CatalogProcessor {
  private readonly apiToken: string;
  private readonly apiBaseUrl: string;
  private readonly logger: LoggerService;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: FetchFn;
  private cache?: PdCache;
  private inflight?: Promise<PdCache | undefined>;

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
  }): PagerDutyAnnotationProcessor | undefined {
    const { config, logger } = options;
    const apiToken = config.getOptionalString('pagerDuty.apiToken');
    if (!apiToken) {
      logger.warn(
        'PagerDutyAnnotationProcessor disabled: pagerDuty.apiToken is not set',
      );
      return undefined;
    }
    const apiBaseUrl =
      config.getOptionalString('pagerDuty.apiBaseUrl') ??
      'https://api.pagerduty.com';
    const cacheTtlMs =
      config.getOptionalNumber(
        'catalog.processors.pagerDutyAnnotations.cacheTtlSeconds',
      ) !== undefined
        ? config.getNumber(
            'catalog.processors.pagerDutyAnnotations.cacheTtlSeconds',
          ) * 1000
        : DEFAULT_CACHE_TTL_MS;
    return new PagerDutyAnnotationProcessor({
      apiToken,
      apiBaseUrl,
      logger,
      cacheTtlMs,
    });
  }

  constructor(options: {
    apiToken: string;
    apiBaseUrl: string;
    logger: LoggerService;
    cacheTtlMs?: number;
    fetchImpl?: FetchFn;
  }) {
    this.apiToken = options.apiToken;
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
    this.logger = options.logger;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getProcessorName(): string {
    return 'PagerDutyAnnotationProcessor';
  }

  async preProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    _emit: CatalogProcessorEmit,
    _originLocation: LocationSpec,
    _cache: CatalogProcessorCache,
  ): Promise<Entity> {
    const annotations = entity.metadata.annotations ?? {};

    if (entity.kind === 'Group') {
      if (annotations[SERVICE_ID_ANNOTATION]) {
        return entity;
      }
      if ((entity.spec as any)?.type !== 'team') {
        return entity;
      }
      const serviceName = teamNameToServiceName(entity.metadata.name);
      if (!serviceName) {
        return entity;
      }
      const pd = await this.getCache();
      const serviceId = pd?.servicesByName.get(serviceName);
      if (!serviceId) {
        return entity;
      }
      return withAnnotation(entity, SERVICE_ID_ANNOTATION, serviceId);
    }

    if (entity.kind === 'User') {
      if (annotations[USER_ID_ANNOTATION]) {
        return entity;
      }
      const email = (entity.spec as any)?.profile?.email;
      if (typeof email !== 'string' || !email) {
        return entity;
      }
      const pd = await this.getCache();
      const userId = pd?.userIdsByEmail.get(email.toLowerCase());
      if (!userId) {
        return entity;
      }
      return withAnnotation(entity, USER_ID_ANNOTATION, userId);
    }

    if (entity.kind === 'Component') {
      if (annotations[SERVICE_ID_ANNOTATION]) {
        return entity;
      }
      const owner = (entity.spec as any)?.owner;
      if (typeof owner !== 'string' || !owner) {
        return entity;
      }
      const serviceName = teamNameToServiceName(owner);
      if (!serviceName) {
        return entity;
      }
      const pd = await this.getCache();
      const serviceId = pd?.servicesByName.get(serviceName);
      if (!serviceId) {
        return entity;
      }
      return withAnnotation(entity, SERVICE_ID_ANNOTATION, serviceId);
    }

    return entity;
  }

  private async getCache(): Promise<PdCache | undefined> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.refresh()
      .then(c => {
        if (c) {
          this.cache = c;
        }
        return this.cache;
      })
      .finally(() => {
        this.inflight = undefined;
      });
    return this.inflight;
  }

  private async refresh(): Promise<PdCache | undefined> {
    try {
      const [services, users] = await Promise.all([
        this.fetchAll<PagerDutyService>('services', 'services'),
        this.fetchAll<PagerDutyUser>('users', 'users'),
      ]);
      const servicesByName = new Map<string, string>();
      for (const s of services) {
        if (s?.name && s?.id) {
          servicesByName.set(s.name, s.id);
        }
      }
      const userIdsByEmail = new Map<string, string>();
      for (const u of users) {
        if (u?.email && u?.id) {
          userIdsByEmail.set(u.email.toLowerCase(), u.id);
        }
      }
      this.logger.info(
        `PagerDutyAnnotationProcessor cache refreshed: ${servicesByName.size} services, ${userIdsByEmail.size} users`,
      );
      return { servicesByName, userIdsByEmail, fetchedAt: Date.now() };
    } catch (error) {
      this.logger.warn(
        `PagerDutyAnnotationProcessor failed to refresh cache: ${error}`,
      );
      return this.cache;
    }
  }

  private async fetchAll<T>(path: string, key: string): Promise<T[]> {
    const result: T[] = [];
    let offset = 0;
    let more = true;
    while (more) {
      const url = `${this.apiBaseUrl}/${path}?limit=${PD_PAGE_LIMIT}&offset=${offset}`;
      const res = await this.fetchImpl(url, {
        headers: {
          Authorization: `Token token=${this.apiToken}`,
          Accept: 'application/vnd.pagerduty+json;version=2',
        },
      });
      if (!res.ok) {
        throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      const items = (body[key] as T[] | undefined) ?? [];
      result.push(...items);
      more = Boolean(body.more) && items.length > 0;
      offset += items.length;
    }
    return result;
  }
}

function teamNameToServiceName(refOrName: string): string | undefined {
  let name: string;
  try {
    name = parseEntityRef(refOrName, {
      defaultKind: 'group',
      defaultNamespace: 'default',
    }).name;
  } catch {
    return undefined;
  }
  if (!name.startsWith(TEAM_NAME_PREFIX)) {
    return undefined;
  }
  return `${name.slice(TEAM_NAME_PREFIX.length)}${SERVICE_NAME_SUFFIX}`;
}

function withAnnotation(entity: Entity, key: string, value: string): Entity {
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      annotations: {
        ...(entity.metadata.annotations ?? {}),
        [key]: value,
      },
    },
  };
}
