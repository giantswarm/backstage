import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { githubAuthenticator } from '@backstage/plugin-auth-backend-module-github-provider';

export const githubAuthProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'github-auth-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
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
