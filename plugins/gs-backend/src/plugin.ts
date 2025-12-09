import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';

/**
 * GS backend plugin
 *
 * @public
 */
export const gsPlugin = createBackendPlugin({
  pluginId: 'gs',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        containerRegistry: containerRegistryServiceRef,
      },
      async init({ httpRouter, containerRegistry }) {
        httpRouter.use(
          await createRouter({
            containerRegistry,
          }),
        );
      },
    });
  },
});
