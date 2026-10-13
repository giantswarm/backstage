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
import {
  AllowedOwnersGithubCredentialsProvider,
  readAllowedOwners,
} from './githubCredentials';
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
        // Routes and actions hand caller-influenced URLs to this provider, so
        // it only ever mints credentials for the owners in
        // `gs.github.allowedOwners` (read once here; shared by the router and
        // the MCP actions).
        const githubCredentialsProvider =
          new AllowedOwnersGithubCredentialsProvider(
            DefaultGithubCredentialsProvider.fromIntegrations(integrations),
            readAllowedOwners(config),
          );

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
