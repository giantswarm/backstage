import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  // createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
// import { createMcpOAuthAuthenticator } from './authenticator';
import { createCimdRouter } from './cimdRouter';
import { MCP_PROVIDER_PREFIX } from './types';

/**
 * Backend module that registers OAuth providers for MCP servers.
 *
 * This module:
 * 1. Discovers MCP servers from auth.providers configuration (mcp-* prefix)
 * 2. Creates OAuth providers for each server using MCP OAuth 2.1 with CIMD
 * 3. Serves Client ID Metadata Documents (CIMD) at well-known endpoints
 *
 * Configuration example:
 * ```yaml
 * auth:
 *   environment: development
 *   providers:
 *     mcp-kubernetes-gazelle:
 *       development:
 *         serverUrl: https://mcp-kubernetes.gazelle.example.com
 *         displayName: Kubernetes (Gazelle)
 *         scopes:
 *           - kubernetes:read
 *           - kubernetes:write
 * ```
 *
 * This creates an auth provider at: /api/auth/mcp-kubernetes-gazelle
 * And serves CIMD at: /.well-known/oauth-client/mcp-kubernetes-gazelle
 */
export const authModuleMcpProviders = createBackendModule({
  pluginId: 'auth',
  moduleId: 'mcp-providers',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.rootLogger,
        httpRouter: coreServices.httpRouter,
      },
      async init({ config, logger, httpRouter }) {
        const providersConfig = config.getOptionalConfig('auth.providers');
        // const backendBaseUrl = config.getString('backend.baseUrl');

        if (!providersConfig) {
          logger.info(
            'No auth providers configured, skipping MCP auth providers',
          );
          return;
        }

        // const environment = config.getString('auth.environment');
        const allProviders = providersConfig.keys();
        const mcpProviderIds = allProviders.filter(p =>
          p.startsWith(MCP_PROVIDER_PREFIX),
        );

        if (mcpProviderIds.length === 0) {
          logger.info(
            'No MCP providers configured (no mcp-* providers in auth.providers)',
          );
          return;
        }

        logger.info(
          `Registering ${mcpProviderIds.length} MCP OAuth provider(s)`,
        );

        // Register CIMD router to serve client metadata documents
        const cimdRouter = createCimdRouter({ config, logger });
        httpRouter.use(cimdRouter);

        // Register OAuth provider for each MCP server
        // for (const providerId of mcpProviderIds) {
        //   const providerConfig = providersConfig
        //     .getConfig(providerId)
        //     .getConfig(environment);

        //   const serverUrl = providerConfig.getString('serverUrl');
        //   const displayName =
        //     providerConfig.getOptionalString('displayName') || providerId;

        //   logger.info(
        //     `Registering MCP auth provider: ${providerId} for ${serverUrl}`,
        //   );

        //   try {
        //     const authenticator = createMcpOAuthAuthenticator(
        //       providerId,
        //       providerConfig,
        //       backendBaseUrl,
        //     );

        //     providers.registerProvider({
        //       providerId,
        //       factory: createOAuthProviderFactory({
        //         authenticator,
        //         // MCP auth providers don't sign in to Backstage
        //         // They only provide OAuth tokens for MCP server access
        //         signInResolver: undefined,
        //       }),
        //     });

        //     logger.info(
        //       `Successfully registered MCP provider: ${providerId} (${displayName})`,
        //     );
        //   } catch (error) {
        //     logger.error(
        //       `Failed to register MCP auth provider ${providerId}: ${error}`,
        //     );
        //   }
        // }
      },
    });
  },
});
