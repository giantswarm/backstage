import { OpenIdConnectApi } from '@backstage/core-plugin-api';
import { KubernetesAuthProvider, KubernetesAuthProvidersApi } from './types';
import { OidcKubernetesAuthProvider } from './OidcKubernetesAuthProvider';

export class KubernetesAuthProviders implements KubernetesAuthProvidersApi {
  private readonly kubernetesAuthProviderMap: Map<
    string,
    KubernetesAuthProvider
  >;

  constructor(options: {
    oidcProviders?: { [key: string]: OpenIdConnectApi };
  }) {
    this.kubernetesAuthProviderMap = new Map<string, KubernetesAuthProvider>();

    if (options.oidcProviders) {
      Object.keys(options.oidcProviders).forEach(provider => {
        this.kubernetesAuthProviderMap.set(
          `oidc.${provider}`,
          new OidcKubernetesAuthProvider(
            provider,
            options.oidcProviders![provider],
          ),
        );
      });
    }
  }

  async getCredentials(authProvider: string): Promise<{ token?: string }> {
    const kubernetesAuthProvider: KubernetesAuthProvider | undefined =
      this.kubernetesAuthProviderMap.get(authProvider);

    if (kubernetesAuthProvider) {
      return await kubernetesAuthProvider.getCredentials();
    }

    if (authProvider.startsWith('oidc.')) {
      throw new Error(
        `KubernetesAuthProviders has no oidcProvider configured for ${authProvider}`,
      );
    }
    throw new Error(
      `authProvider "${authProvider}" has no KubernetesAuthProvider defined for it`,
    );
  }
}
