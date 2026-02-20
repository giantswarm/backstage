import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';
import { mimirServiceRef } from './services/MimirService';

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
        mimir: mimirServiceRef,
      },
      async init({ httpRouter, containerRegistry, mimir }) {
        httpRouter.use(
          await createRouter({
            containerRegistry,
            mimir,
          }),
        );
      },
    });
  },
});
