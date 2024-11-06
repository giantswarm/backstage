import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { providers } from '@backstage/plugin-auth-backend';
import { authProvidersExtensionPoint } from '@backstage/plugin-auth-node';

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
      },
    });
  },
});
