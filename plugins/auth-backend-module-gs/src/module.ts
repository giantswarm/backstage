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
import { oauth2Authenticator } from './oauth2/authenticator';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const OAUTH_PROVIDER_NAME_PREFIX = 'mcp-';

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
      },
      async init({ providersExtensionPoint, config, logger }) {
        const providersConfig = config.getConfig('auth.providers');
        const configuredProviders: string[] = providersConfig?.keys() || [];

        const customOIDCProviders = configuredProviders.filter(provider =>
          provider.startsWith(OIDC_PROVIDER_NAME_PREFIX),
        );

        for (const providerName of customOIDCProviders) {
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

        const customOAuthProviders = configuredProviders.filter(provider =>
          provider.startsWith(OAUTH_PROVIDER_NAME_PREFIX),
        );

        for (const providerName of customOAuthProviders) {
          logger.info(`Configuring auth provider: ${providerName}`);

          // httpRouter.use(createCimdRouter(baseUrl, providerName));

          providersExtensionPoint.registerProvider({
            providerId: providerName,
            factory: createOAuthProviderFactory({
              authenticator: oauth2Authenticator,
            }),
          });
        }
      },
    });
  },
});
