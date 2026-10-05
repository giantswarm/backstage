import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { registerMcpActions } from './mcpActions';
import { createRouter } from './router';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';
import { mimirServiceRef } from './services/MimirService';
import { ManagementClusterVersionsService } from './services/ManagementClusterVersions';

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
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        discovery: coreServices.discovery,
        containerRegistry: containerRegistryServiceRef,
        mimir: mimirServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
        catalog: catalogServiceRef,
      },
      async init({
        httpRouter,
        logger,
        config,
        auth,
        httpAuth,
        discovery,
        containerRegistry,
        mimir,
        actionsRegistry,
        catalog,
      }) {
        const integrations = ScmIntegrations.fromConfig(config);
        const githubCredentialsProvider =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);

        httpRouter.use(
          await createRouter({
            config,
            containerRegistry,
            mimir,
            githubCredentialsProvider,
            httpAuth,
            managementClusterVersions: new ManagementClusterVersionsService({
              config,
              auth,
              discovery,
              logger,
            }),
          }),
        );

        registerMcpActions(
          actionsRegistry,
          containerRegistry,
          githubCredentialsProvider,
          catalog,
          logger,
        );
      },
    });
  },
});
