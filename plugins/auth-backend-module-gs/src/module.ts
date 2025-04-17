import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { OidcAuthResult, providers } from '@backstage/plugin-auth-backend';
import {
  authProvidersExtensionPoint,
  AuthResolverContext,
  SignInResolver,
} from '@backstage/plugin-auth-node';
import { createAuthProviderFactory } from './auth/createAuthProviderFactory';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const CUSTOM_OIDC_PROVIDER_NAME_PREFIX = 'gs-';

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

const customSignInResolver: SignInResolver<OidcAuthResult> = async (
  info,
  ctx,
) => {
  const userInfo = info.result.userinfo;

  const idpClaim = info.result.userinfo.federated_claims as IdPClaim;
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
        const customProviders = configuredProviders.filter(
          provider =>
            provider.startsWith(OIDC_PROVIDER_NAME_PREFIX) ||
            provider.startsWith(CUSTOM_OIDC_PROVIDER_NAME_PREFIX),
        );

        for (const providerName of customProviders) {
          try {
            logger.info(`Configuring auth provider: ${providerName}`);

            if (providerName.startsWith(OIDC_PROVIDER_NAME_PREFIX)) {
              const providerConfig = providersConfig
                .getConfig(providerName)
                .getConfig(config.getString('auth.environment'));
              const metadataUrl = providerConfig.getString('metadataUrl');
              const response = await fetch(new URL(metadataUrl));
              if (!response.ok) {
                throw new Error(response.statusText);
              }
            }

            providersExtensionPoint.registerProvider({
              providerId: providerName,
              factory: providerName.startsWith(CUSTOM_OIDC_PROVIDER_NAME_PREFIX)
                ? createAuthProviderFactory()
                : providers.oidc.create({
                    signIn: {
                      resolver: customSignInResolver,
                    },
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
