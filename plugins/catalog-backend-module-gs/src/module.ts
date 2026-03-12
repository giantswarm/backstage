import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import { GiantSwarmLocationProcessor } from './processor';

export const catalogModuleGS = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        urlReader: coreServices.urlReader,
      },
      async init({ catalog, urlReader }) {
        catalog.addProcessor(new GiantSwarmLocationProcessor(urlReader));
      },
    });
  },
});
