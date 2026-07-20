import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  microsoftAuthApiRef,
  googleAuthApiRef,
} from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  KubernetesAuthProviders,
  kubernetesAuthProvidersApiRef,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import {
  gsAuthProvidersApiRef,
  GSAuthProvidersApi,
  GSDiscoveryApiClient,
  KubernetesClient,
} from '@giantswarm/backstage-plugin-gs';

const OIDC_AUTH_PROVIDER_PREFIX = 'oidc.';

type KubernetesRequestBody = Parameters<
  KubernetesAuthProvidersApi['decorateRequestBodyForAuth']
>[1];

/**
 * Kubernetes auth-providers implementation that resolves OIDC providers lazily
 * from `GSAuthProvidersApi`.
 *
 * The upstream `KubernetesAuthProviders` snapshots its `oidcProviders` map at
 * construction. Since the per-installation OIDC providers are now built only
 * after installations load (post sign-in), we cannot pass a complete map at
 * app-boot. Instead, non-OIDC providers (microsoft/google/…) are delegated to a
 * base `KubernetesAuthProviders`, while `oidc.<provider>` credentials are
 * resolved on demand through `gsAuthProvidersApi.getKubernetesAuthApi()` (which
 * awaits lazy initialization).
 */
class GSKubernetesAuthProviders implements KubernetesAuthProvidersApi {
  constructor(
    private readonly base: KubernetesAuthProvidersApi,
    private readonly gsAuthProvidersApi: GSAuthProvidersApi,
  ) {}

  private isOidc(authProvider: string): boolean {
    return authProvider.startsWith(OIDC_AUTH_PROVIDER_PREFIX);
  }

  private async resolveOidcToken(authProvider: string): Promise<string> {
    const providerName = authProvider.slice(OIDC_AUTH_PROVIDER_PREFIX.length);
    const authApi =
      await this.gsAuthProvidersApi.getKubernetesAuthApi(providerName);
    if (!authApi) {
      throw new Error(
        `OIDC auth provider "${providerName}" is not configured.`,
      );
    }
    return authApi.getIdToken();
  }

  async getCredentials(authProvider: string): Promise<{ token?: string }> {
    if (this.isOidc(authProvider)) {
      return { token: await this.resolveOidcToken(authProvider) };
    }
    return this.base.getCredentials(authProvider);
  }

  async decorateRequestBodyForAuth(
    authProvider: string,
    requestBody: KubernetesRequestBody,
  ): Promise<KubernetesRequestBody> {
    if (this.isOidc(authProvider)) {
      const providerName = authProvider.slice(OIDC_AUTH_PROVIDER_PREFIX.length);
      const token = await this.resolveOidcToken(authProvider);
      const auth = { ...(requestBody.auth ?? {}) } as {
        oidc?: { [key: string]: string };
      };
      auth.oidc = { ...(auth.oidc ?? {}), [providerName]: token };
      requestBody.auth = auth;
      return requestBody;
    }
    return this.base.decorateRequestBodyForAuth(authProvider, requestBody);
  }
}

export const KubernetesAuthProvidersOverride = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: kubernetesAuthProvidersApiRef,
      deps: {
        microsoftAuthApi: microsoftAuthApiRef,
        googleAuthApi: googleAuthApiRef,
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: ({ microsoftAuthApi, googleAuthApi, gsAuthProvidersApi }) => {
        const base = new KubernetesAuthProviders({
          microsoftAuthApi,
          googleAuthApi,
        });
        return new GSKubernetesAuthProviders(base, gsAuthProvidersApi);
      },
    }),
});

export const KubernetesClientOverride = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: kubernetesApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: ({
        configApi,
        discoveryApi,
        fetchApi,
        kubernetesAuthProvidersApi,
      }) =>
        new KubernetesClient({
          configApi,
          discoveryApi: discoveryApi as GSDiscoveryApiClient,
          fetchApi,
          kubernetesAuthProvidersApi,
        }),
    }),
});
