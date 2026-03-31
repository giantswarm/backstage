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

export class SbomDependencyProcessor implements CatalogProcessor {
  constructor(
    private readonly db: Knex,
    private readonly logger: LoggerService,
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
      catalogApi,
      auth,
      db,
      logger,
      scheduler,
      schedule,
    });

    return new SbomDependencyProcessor(db, logger);
  }

  getProcessorName(): string {
    return 'SbomDependencyProcessor';
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

    const sbomDeps = rows.map(row => `component:${row.dependency_name}`);
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
