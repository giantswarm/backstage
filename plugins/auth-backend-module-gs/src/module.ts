import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  AuthResolverContext,
  createOAuthProviderFactory,
  OAuthAuthenticatorResult,
  SignInResolver,
} from '@backstage/plugin-auth-node';
import {
  oidcAuthenticator,
  OidcAuthResult,
} from '@backstage/plugin-auth-backend-module-oidc-provider';
import { oauth2Authenticator } from './oauth2/authenticator';
import { createCimdRouter } from './oauth2/cimdRouter';
import { createClusterTokenRouter } from './clusterToken/router';
import { waitForIssuerMetadata } from './oidc/issuerMetadata';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const MCP_PROVIDER_NAME_PREFIX = 'mcp-';

type IdPClaim = {
  connector_id: string;
  user_id: string;
};

function signInWithGuestUser(ctx: AuthResolverContext) {
  const guestUserRef = 'user:default/guest';

  return ctx.issueToken({
    claims: {
      sub: guestUserRef,
      ent: [guestUserRef],
    },
  });
}

const customSignInResolver: SignInResolver<
  OAuthAuthenticatorResult<OidcAuthResult>
> = async (info, ctx) => {
  const userInfo = info.result.fullProfile.userinfo;

  const idpClaim = userInfo.federated_claims as IdPClaim;
  const connectorId = idpClaim.connector_id;

  try {
    if (connectorId === 'giantswarm-ad' && userInfo.email) {
      return await ctx.signInWithCatalogUser({
        filter: {
          'spec.profile.email': userInfo.email,
        },
      });
    }

    if (connectorId === 'giantswarm-github' && userInfo.preferred_username) {
      return await ctx.signInWithCatalogUser({
        filter: {
          'metadata.name': userInfo.preferred_username,
        },
      });
    }
  } catch (err) {
    return signInWithGuestUser(ctx);
  }

  if (userInfo.email) {
    const username = userInfo.email.split('@')[0];
    const userRef = `user:default/${username}`;

    return ctx.issueToken({
      claims: {
        sub: userRef,
        ent: [userRef],
      },
    });
  }

  return signInWithGuestUser(ctx);
};

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
        // login provider (gs.authProvider) is registered here. Restricting the
        // loop to it also prevents a stray oidc-<mc> block from stalling startup
        // on an unreachable Dex's metadata discovery.
        const mainAuthProvider = config.getOptionalString('gs.authProvider');
        const customOIDCProviders = configuredProviders.filter(
          provider =>
            provider.startsWith(OIDC_PROVIDER_NAME_PREFIX) &&
            provider === mainAuthProvider,
        );
        for (const providerName of customOIDCProviders) {
          logger.info(`Configuring auth provider: ${providerName}`);

          const providerConfig = providersConfig
            .getConfig(providerName)
            .getConfig(config.getString('auth.environment'));
          const metadataUrl = providerConfig.getString('metadataUrl');

          // The main login provider is required: a portal without login is
          // unusable, and skipping registration here would serve 404s on
          // every login until the pod is manually restarted. Retry to absorb
          // transient Dex unavailability, then let the error fail startup so
          // the orchestrator restarts the backend until Dex is reachable.
          await waitForIssuerMetadata(providerName, metadataUrl, logger);

          providersExtensionPoint.registerProvider({
            providerId: providerName,
            factory: createOAuthProviderFactory({
              authenticator: oidcAuthenticator,
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
      },
    });
  },
});
