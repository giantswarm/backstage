import {
  coreServices,
  createBackendModule,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import type {
  DatabaseService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import {
  catalogProcessingExtensionPoint,
  catalogServiceRef,
} from '@backstage/plugin-catalog-node';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import type { Knex } from 'knex';
import { GiantSwarmLocationProcessor } from './processor';
import { SbomDependencyProcessor } from './SbomDependencyProcessor';
import { createSbomRefreshTask } from './sbomScheduledTask';

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-catalog-backend-module-gs',
  'migrations',
);

async function initializeSbomPersistence(options: {
  database: DatabaseService;
  logger: LoggerService;
}): Promise<{ db: Knex; processor: SbomDependencyProcessor }> {
  const { database, logger } = options;
  const db = await database.getClient();

  if (!database.migrations?.skip) {
    await db.migrate.latest({
      directory: migrationsDir,
      tableName: 'knex_migrations_catalog_module_gs',
    });
  }

  return { db, processor: new SbomDependencyProcessor(db, logger) };
}

export const catalogModuleGS = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        catalogApi: catalogServiceRef,
        urlReader: coreServices.urlReader,
        config: coreServices.rootConfig,
        database: coreServices.database,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
        auth: coreServices.auth,
      },
      async init({
        catalog,
        catalogApi,
        urlReader,
        config,
        database,
        logger,
        scheduler,
        auth,
      }) {
        catalog.addProcessor(new GiantSwarmLocationProcessor(urlReader));

        const sbomEnabled = config.getOptionalBoolean(
          'catalog.processors.sbomDependencies.enabled',
        );
        if (!sbomEnabled) {
          return;
        }

        const { db, processor } = await initializeSbomPersistence({
          database,
          logger,
        });
        catalog.addProcessor(processor);

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
      },
    });
  },
});
