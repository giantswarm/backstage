import fetch from 'node-fetch';
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
import express from 'express';
import Router from 'express-promise-router';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';

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

/**
 * Creates a router with the Client ID Metadata Document (CIMD) endpoint.
 *
 * @param baseUrl - The base URL of the backend (e.g., http://localhost:7007)
 * @returns Express router with the CIMD endpoint
 */
function createCimdRouter(baseUrl: string): express.Router {
  const router = Router();

  // Remove trailing slash from baseUrl if present
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  // Construct the client_id (full URL of this endpoint)
  const clientId = `${normalizedBaseUrl}/api/auth/client.json`;

  // Construct redirect_uri
  const redirectUri = `${normalizedBaseUrl}/api/auth/oauth2/handler/frame`;

  // Client ID Metadata Document
  const cimd = {
    client_id: clientId,
    client_name: 'Backstage',
    client_uri: 'https://docs.giantswarm.io/overview/developer-portal/',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };

  /**
   * GET /client.json
   *
   * Returns the Client ID Metadata Document (CIMD) for OAuth client registration.
   * This endpoint is publicly accessible and follows the CIMD specification.
   */
  router.get('/client.json', (_, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(cimd);
  });

  return router;
}

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
      },
      async init({ providersExtensionPoint, config, logger, httpRouter }) {
        // Register CIMD endpoint
        const baseUrl = config.getString('backend.baseUrl');
        httpRouter.use(createCimdRouter(baseUrl));
        const providersConfig = config.getConfig('auth.providers');
        const configuredProviders: string[] = providersConfig?.keys() || [];
        const customProviders = configuredProviders.filter(provider =>
          provider.startsWith(OIDC_PROVIDER_NAME_PREFIX),
        );

        for (const providerName of customProviders) {
          try {
            logger.info(`Configuring auth provider: ${providerName}`);

            const providerConfig = providersConfig
              .getConfig(providerName)
              .getConfig(config.getString('auth.environment'));
            const metadataUrl = providerConfig.getString('metadataUrl');
            const response = await fetch(new URL(metadataUrl));
            if (!response.ok) {
              throw new Error(response.statusText);
            }

            const isMainAuthProvider =
              config.getOptionalString('gs.authProvider') === providerName;

            providersExtensionPoint.registerProvider({
              providerId: providerName,
              factory: createOAuthProviderFactory({
                authenticator: oidcAuthenticator,
                signInResolver: isMainAuthProvider
                  ? customSignInResolver
                  : undefined,
              }),
            });
          } catch (err) {
            logger.error(
              `Failed to fetch issuer metadata for ${providerName} auth provider`,
            );
            logger.error((err as Error).toString());
          }
        }
      },
    });
  },
});
