import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { providers } from '@backstage/plugin-auth-backend';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { githubAuthenticator } from '@backstage/plugin-auth-backend-module-github-provider';

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
        const gsProviders = configuredProviders.filter(provider =>
          provider.startsWith('gs-'),
        );

        for (const providerName of gsProviders) {
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
            providersExtensionPoint.registerProvider({
              providerId: providerName,
              factory: providers.oidc.create(),
            });
          } catch (err) {
            logger.error(
              `Failed to fetch issuer metadata for ${providerName} auth provider`,
            );
            logger.error((err as Error).toString());
          }
        }

        /**
         * Custom sign-in resolver for GitHub auth provider that looks up the user
         * by matching their GitHub username to the entity metadata.name
         */
        providersExtensionPoint.registerProvider({
          providerId: 'github',
          factory: createOAuthProviderFactory({
            authenticator: githubAuthenticator,
            async signInResolver(info, ctx) {
              const { fullProfile } = info.result;

              const userId = fullProfile.username;
              if (!userId) {
                throw new Error(
                  `GitHub user profile does not contain a username`,
                );
              }

              return ctx.signInWithCatalogUser({
                filter: { 'metadata.name': userId },
              });
            },
          }),
        });
      },
    });
  },
});
