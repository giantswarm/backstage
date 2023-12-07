import {
  createRouter,
  providers,
  defaultAuthProviderFactories,
} from '@backstage/plugin-auth-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import { AuthProviderFactory } from '@backstage/plugin-auth-node';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const providersConfig = env.config.getConfig('auth.providers');
  const configuredProviders: string[] = providersConfig?.keys() || [];
  const gsProviders = configuredProviders.filter((provider) => provider.startsWith('gs-'));
  const gsAuthProviderFactories: {[s: string]: AuthProviderFactory} = {};
  for (const providerName of gsProviders) {
    env.logger.info(`Configuring auth provider: ${providerName}`);
    try {
      const providerConfig = providersConfig.getConfig(providerName).getConfig(env.config.getString('auth.environment'));
      const metadataUrl = providerConfig.getString('metadataUrl');
      const response = await fetch(new URL(metadataUrl));
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      gsAuthProviderFactories[providerName] = providers.oidc.create();
    } catch (err) {
      env.logger.error(`Failed to fetch issuer metadata for ${providerName} auth provider`)
      env.logger.error((err as Error).toString());
    }
  };

  return await createRouter({
    logger: env.logger,
    config: env.config,
    database: env.database,
    discovery: env.discovery,
    tokenManager: env.tokenManager,
    providerFactories: {
      ...defaultAuthProviderFactories,
      ...gsAuthProviderFactories,

      // This replaces the default GitHub auth provider with a customized one.
      // The `signIn` option enables sign-in for this provider, using the
      // identity resolution logic that's provided in the `resolver` callback.
      //
      // This particular resolver makes all users share a single "guest" identity.
      // It should only be used for testing and trying out Backstage.
      //
      // If you want to use a production ready resolver you can switch to
      // the one that is commented out below, it looks up a user entity in the
      // catalog using the GitHub username of the authenticated user.
      // That resolver requires you to have user entities populated in the catalog,
      // for example using https://backstage.io/docs/integrations/github/org
      //
      // There are other resolvers to choose from, and you can also create
      // your own, see the auth documentation for more details:
      //
      //   https://backstage.io/docs/auth/identity-resolver
      github: providers.github.create({
        signIn: {
          resolver: providers.github.resolvers.usernameMatchingUserEntityName(),
        },
      }),
    },
  });
}
