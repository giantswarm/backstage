import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { providers } from '@backstage/plugin-auth-backend';
import {
  authProvidersExtensionPoint,
} from '@backstage/plugin-auth-node';

/** @public */
export const authModuleGsProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'gs-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providersExtensionPoint: authProvidersExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ providersExtensionPoint, config }) {
        const providersConfig = config.getConfig('auth.providers');
        const configuredProviders: string[] = providersConfig?.keys() || [];
        const gsProviders = configuredProviders.filter((provider) => provider.startsWith('gs-'));
        for (const providerName of gsProviders) {
          providersExtensionPoint.registerProvider({
            providerId: providerName,
            factory: providers.oidc.create(),
          });
        };
      },
    });
  },
});
