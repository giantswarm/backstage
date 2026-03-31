import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  catalogProcessingExtensionPoint,
  catalogServiceRef,
} from '@backstage/plugin-catalog-node';
import { GiantSwarmLocationProcessor } from './GiantSwarmLocationProcessor';
import { SbomDependencyProcessor } from './SbomDependencyProcessor';

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
        if (sbomEnabled) {
          catalog.addProcessor(
            await SbomDependencyProcessor.create({
              config,
              database,
              logger,
              catalogApi,
              scheduler,
              auth,
            }),
          );
        }
      },
    });
  },
});
