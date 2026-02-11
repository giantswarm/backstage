import fetch from 'node-fetch';
import {
  coreServices,
  createBackendModule,
  LoggerService,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  AuthResolverContext,
  createOAuthProviderFactory,
  OAuthAuthenticatorResult,
  SignInResolver,
} from '@backstage/plugin-auth-node';
import { oidcAuthenticator, OidcAuthResult } from './oidc/authenticator';
import { oauth2Authenticator } from './oauth2/authenticator';
import { createCimdRouter } from './oauth2/cimdRouter';

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

function createLoggingSignInResolver(
  resolver: SignInResolver<OAuthAuthenticatorResult<OidcAuthResult>>,
  providerName: string,
  logger: LoggerService,
): SignInResolver<OAuthAuthenticatorResult<OidcAuthResult>> {
  return async (info, ctx) => {
    try {
      return await resolver(info, ctx);
    } catch (error) {
      const userInfo = info.result.fullProfile.userinfo;
      logger.error(
        `Sign-in resolver failed for provider '${providerName}', ` +
          `email=${userInfo.email ?? 'unknown'}, ` +
          `connector=${(userInfo.federated_claims as IdPClaim)?.connector_id ?? 'unknown'}: ${error}`,
      );
      throw error;
    }
  };
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
        const baseUrl = config.getString('backend.baseUrl');
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

            const loggingSignInResolver = isMainAuthProvider
              ? createLoggingSignInResolver(
                  customSignInResolver,
                  providerName,
                  logger,
                )
              : undefined;

            providersExtensionPoint.registerProvider({
              providerId: providerName,
              factory: createOAuthProviderFactory({
                authenticator: oidcAuthenticator,
                signInResolver: loggingSignInResolver,
              }),
            });
          } catch (err) {
            logger.error(
              `Failed to fetch issuer metadata for ${providerName} auth provider`,
            );
            logger.error((err as Error).toString());
          }
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
      },
    });
  },
});
