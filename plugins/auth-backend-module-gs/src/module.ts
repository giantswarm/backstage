import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { providers } from '@backstage/plugin-auth-backend';
import { authProvidersExtensionPoint } from '@backstage/plugin-auth-node';
import { createAuthProviderFactory } from './auth/createAuthProviderFactory';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const CUSTOM_OIDC_PROVIDER_NAME_PREFIX = 'gs-';

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
                : providers.oidc.create(),
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
