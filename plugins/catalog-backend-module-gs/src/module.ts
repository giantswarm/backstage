import {
  coreServices,
  createBackendModule,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import {
  catalogProcessingExtensionPoint,
  catalogServiceRef,
} from '@backstage/plugin-catalog-node';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { GiantSwarmLocationProcessor } from './processor';
import { SbomDependencyProcessor } from './SbomDependencyProcessor';
import { createSbomRefreshTask } from './sbomScheduledTask';

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

        const integrations = ScmIntegrations.fromConfig(config);
        const credentialsProvider =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);

        const db = await database.getClient();

        if (!database.migrations?.skip) {
          await db.migrate.latest({
            directory: resolvePackagePath(
              '@giantswarm/backstage-plugin-catalog-backend-module-gs',
              'migrations',
            ),
            tableName: 'knex_migrations_catalog_module_gs',
          });
        }

        catalog.addProcessor(new SbomDependencyProcessor(db, logger));

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
