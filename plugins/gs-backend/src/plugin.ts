import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { registerMcpActions } from './mcpActions';
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
        logger: coreServices.logger,
        containerRegistry: containerRegistryServiceRef,
        mimir: mimirServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({
        httpRouter,
        logger,
        containerRegistry,
        mimir,
        actionsRegistry,
      }) {
        httpRouter.use(
          await createRouter({
            containerRegistry,
            mimir,
          }),
        );

        registerMcpActions(actionsRegistry, containerRegistry, logger);
      },
    });
  },
});
