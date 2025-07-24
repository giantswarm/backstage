import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createFindScaffolderTemplatesAction } from './actions/createFindScaffolderTemplatesAction';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';

/**
 * gsPlugin backend plugin
 *
 * @public
 */
export const gsPlugin = createBackendPlugin({
  pluginId: 'gs',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        catalog: catalogServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({ catalog, actionsRegistry }) {
        createFindScaffolderTemplatesAction({
          catalog,
          actionsRegistry,
        });
      },
    });
  },
});
