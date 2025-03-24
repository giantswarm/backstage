import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import {
  ServiceDeploymentsProcessor,
  ServiceReleaseInfoProcessor,
} from './processors';

export const catalogModuleGS = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ catalog, config, logger }) {
        catalog.addProcessor([
          new ServiceDeploymentsProcessor(),
          ServiceReleaseInfoProcessor.fromConfig(config, {
            logger,
          }),
        ]);
      },
    });
  },
});
