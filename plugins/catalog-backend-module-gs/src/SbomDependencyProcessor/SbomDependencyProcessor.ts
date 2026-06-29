import type { Entity } from '@backstage/catalog-model';
import type {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
  CatalogService,
} from '@backstage/plugin-catalog-node';
import type { LocationSpec } from '@backstage/plugin-catalog-common';
import {
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import type {
  AuthService,
  DatabaseService,
  LoggerService,
  RootConfigService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import type { Knex } from 'knex';
import { createSbomRefreshTask } from './sbomScheduledTask';

const GITHUB_PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-catalog-backend-module-gs',
  'migrations',
);

const EXISTING_COMPONENTS_CACHE_TTL_MS = 5 * 60 * 1000;

export class SbomDependencyProcessor implements CatalogProcessor {
  private existingComponentsCache?: {
    names: Set<string>;
    expiresAt: number;
  };

  constructor(
    private readonly db: Knex,
    private readonly logger: LoggerService,
    private readonly catalogApi: CatalogService,
    private readonly auth: AuthService,
  ) {}

  static async create(options: {
    config: RootConfigService;
    database: DatabaseService;
    logger: LoggerService;
    catalogApi: CatalogService;
    scheduler: SchedulerService;
    auth: AuthService;
  }): Promise<SbomDependencyProcessor> {
    const { config, database, logger, catalogApi, scheduler, auth } = options;

    const db = await database.getClient();

    if (!database.migrations?.skip) {
      await db.migrate.latest({
        directory: migrationsDir,
        tableName: 'knex_migrations_catalog_module_gs',
      });
    }

    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);

    const scheduleConfig = config.getOptionalConfig(
      'catalog.processors.sbomDependencies.schedule',
    );
    const schedule = scheduleConfig
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
      : undefined;

    await createSbomRefreshTask({
      credentialsProvider,
      integrations,
      catalogApi,
      auth,
      db,
      logger,
      scheduler,
      schedule,
    });

    return new SbomDependencyProcessor(db, logger, catalogApi, auth);
  }

  getProcessorName(): string {
    return 'SbomDependencyProcessor';
  }

  /**
   * Returns the names of all Component entities that exist in the `default`
   * namespace. SBOM dependencies are expressed as the short ref
   * `component:<name>`, which resolves to `component:default/<name>`, so
   * filtering against this set drops dependencies whose target component is
   * not in the catalog (e.g. archived GS Go libs) and would otherwise show up
   * as dangling relations on the entity page.
   *
   * The result is cached briefly to avoid a catalog query per processed
   * entity. Returns `undefined` if the catalog cannot be queried, in which
   * case the caller falls back to keeping all dependencies.
   */
  private async getExistingComponentNames(): Promise<Set<string> | undefined> {
    const now = Date.now();
    if (
      this.existingComponentsCache &&
      this.existingComponentsCache.expiresAt > now
    ) {
      return this.existingComponentsCache.names;
    }

    try {
      const { token } = await this.auth.getPluginRequestToken({
        onBehalfOf: await this.auth.getOwnServiceCredentials(),
        targetPluginId: 'catalog',
      });
      const credentials = await this.auth.authenticate(token);

      const { items } = await this.catalogApi.getEntities(
        {
          filter: { kind: 'Component' },
          fields: ['metadata.name', 'metadata.namespace'],
        },
        { credentials },
      );

      const names = new Set<string>();
      for (const item of items) {
        const namespace = item.metadata.namespace ?? 'default';
        if (namespace === 'default') {
          names.add(item.metadata.name);
        }
      }

      this.existingComponentsCache = {
        names,
        expiresAt: now + EXISTING_COMPONENTS_CACHE_TTL_MS,
      };
      return names;
    } catch (error) {
      this.logger.warn(
        `Failed to load existing components for dependency filtering: ${error}`,
      );
      return undefined;
    }
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

    const slug = entity.metadata.annotations?.[GITHUB_PROJECT_SLUG_ANNOTATION];
    if (!slug) {
      return entity;
    }

    let rows: Array<{ dependency_name: string }>;
    try {
      rows = await this.db('sbom_dependencies')
        .select('dependency_name')
        .where('repo_slug', slug);
    } catch (error) {
      this.logger.warn(
        `Failed to query SBOM dependencies for ${slug}: ${error}`,
      );
      return entity;
    }

    if (rows.length === 0) {
      return entity;
    }

    // Only depend on components that actually exist in the catalog. If the
    // catalog can't be queried, keep all deps rather than silently dropping
    // real dependencies because of a transient error.
    const existingComponentNames = await this.getExistingComponentNames();
    const dependencyNames = existingComponentNames
      ? rows
          .map(row => row.dependency_name)
          .filter(name => existingComponentNames.has(name))
      : rows.map(row => row.dependency_name);

    const sbomDeps = dependencyNames.map(name => `component:${name}`);
    const existing = ((entity.spec as any)?.dependsOn as string[]) ?? [];
    const merged = [...new Set([...existing, ...sbomDeps])];

    return {
      ...entity,
      spec: {
        ...entity.spec,
        dependsOn: merged,
      },
    };
  }
}
