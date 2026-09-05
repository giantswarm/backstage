import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { oauth2Authenticator } from './oauth2/authenticator';
import { createCimdRouter } from './oauth2/cimdRouter';
import { createClusterTokenRouter } from './clusterToken/router';
import { createGithubTokenRouter } from './githubToken/router';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { gsOidcAuthenticator } from './oidc/authenticator';
import { customSignInResolver } from './signInResolver';
import { waitForIssuerMetadata } from './oidc/issuerMetadata';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const MCP_PROVIDER_NAME_PREFIX = 'mcp-';

/** @public */
export const authModuleGsProviders = createBackendModule({
  pluginId: 'auth',
  moduleId: 'gs-providers',
  register(reg) {
    reg.registerInit({
      deps: {
        providersExtensionPoint: authProvidersExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.rootLogger,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
      },
      async init({
        providersExtensionPoint,
        config,
        logger,
        httpRouter,
        httpAuth,
      }) {
        const baseUrl = config.getString('backend.baseUrl');
        const providersConfig = config.getConfig('auth.providers');
        const configuredProviders: string[] = providersConfig?.keys() || [];

        // Broker-only cluster auth (giantswarm#36902): per-cluster oidc-<mc>
        // providers are no longer used for cluster access -- the frontend mints
        // those tokens via the muster cluster-token broker. Only the main SSO
        // login provider (gs.authProvider) is registered here, so a stray
        // oidc-<mc> block cannot stall startup on an unreachable Dex's
        // metadata discovery.
        const mainAuthProvider = config.getOptionalString('gs.authProvider');
        if (
          mainAuthProvider &&
          mainAuthProvider.startsWith(OIDC_PROVIDER_NAME_PREFIX) &&
          configuredProviders.includes(mainAuthProvider)
        ) {
          logger.info(`Configuring auth provider: ${mainAuthProvider}`);

          const providerConfig = providersConfig
            .getConfig(mainAuthProvider)
            .getConfig(config.getString('auth.environment'));
          const metadataUrl = providerConfig.getString('metadataUrl');

          // The main login provider is required: a portal without login is
          // unusable, and skipping registration here would serve 404s on
          // every login until the pod is manually restarted. Wait, with
          // backoff and without giving up, until Dex answers discovery:
          // startup stays blocked, so the pod reports NotReady until the
          // issuer is reachable and then finishes booting on its own.
          // Failing startup instead would restart nothing -- the backend
          // swallows the startup rejection and keeps serving readiness 503
          // (giantswarm/backstage#2144).
          await waitForIssuerMetadata(mainAuthProvider, metadataUrl, logger);

          providersExtensionPoint.registerProvider({
            providerId: mainAuthProvider,
            factory: createOAuthProviderFactory({
              // gsOidcAuthenticator wraps the upstream oidc authenticator so
              // that a discovery failure after this point (e.g. Dex flapping
              // between the check above and the first login) is retried per
              // request instead of being cached for the process lifetime.
              authenticator: gsOidcAuthenticator,
              signInResolver: customSignInResolver,
            }),
          });
        }

        const customMCPProviders = configuredProviders.filter(provider =>
          provider.startsWith(MCP_PROVIDER_NAME_PREFIX),
        );

        for (const providerName of customMCPProviders) {
          logger.info(`Configuring auth provider: ${providerName}`);

          const authEnvironment = config.getString('auth.environment');
          const providerConfig = providersConfig
            .getConfig(providerName)
            .getConfig(authEnvironment);

          const extraRedirectUris =
            providerConfig.getOptionalStringArray('extraRedirectUris');
          // Register CIMD router to serve client metadata documents
          const cimdRouter = createCimdRouter(
            baseUrl,
            providerName,
            { extraRedirectUris },
            logger,
          );
          httpRouter.use(cimdRouter);

          providersExtensionPoint.registerProvider({
            providerId: providerName,
            factory: createOAuthProviderFactory({
              authenticator: oauth2Authenticator,
            }),
          });
        }

        const clusterTokenRouter = createClusterTokenRouter({
          config,
          logger,
          httpAuth,
        });
        if (clusterTokenRouter) {
          logger.info(
            'Cluster token broker is configured, registering cluster token route',
          );
          httpRouter.use(clusterTokenRouter);
        }

        // GitHub as the person through muster (gs.github): the standard
        // githubAuthApiRef mints from this route; the grant lives in muster.
        const github = MusterServerClient.fromConfig(
          config,
          logger,
          'gs.github',
        );
        if (github) {
          const githubTokenRouter = createGithubTokenRouter({
            config,
            logger,
            httpAuth,
            github,
          });
          if (githubTokenRouter) {
            logger.info(
              `GitHub via muster is configured (server '${github.server}'), registering github-token routes`,
            );
            httpRouter.use(githubTokenRouter);
          }
        }
      },
    });
  },
});
