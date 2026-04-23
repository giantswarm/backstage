import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
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
        config: coreServices.rootConfig,
        containerRegistry: containerRegistryServiceRef,
        mimir: mimirServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({
        httpRouter,
        logger,
        config,
        containerRegistry,
        mimir,
        actionsRegistry,
      }) {
        const integrations = ScmIntegrations.fromConfig(config);
        const githubCredentialsProvider =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);

        httpRouter.use(
          await createRouter({
            config,
            logger,
            containerRegistry,
            mimir,
            githubCredentialsProvider,
          }),
        );

        httpRouter.addAuthPolicy({
          path: '/branding',
          allow: 'unauthenticated',
        });

        registerMcpActions(
          actionsRegistry,
          containerRegistry,
          githubCredentialsProvider,
          logger,
        );
      },
    });
  },
});
