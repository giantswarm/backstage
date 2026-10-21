import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  AuthRequestOptions,
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
import type {
  InstallationTokenOptions,
  KubernetesAuthProvidersWithOptionsApi,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  asLoginRequestCaller,
  gsAuthProvidersApiRef,
  GSAuthProvidersApi,
  GSDiscoveryApiClient,
  KubernetesClient,
} from '@giantswarm/backstage-plugin-gs';
import {
  hasUserGesture as defaultHasUserGesture,
  PortalSessionExpiredError,
} from '../app/backstageFetch';

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
 *
 * An OIDC credential asked for with `minLifetimeLeft` (an agent turn's) comes
 * from `gsAuthProvidersApi.getLastingIdToken`, which refreshes the session
 * first when its token has less of its lifetime left.
 */
export class GSKubernetesAuthProviders
  implements KubernetesAuthProvidersApi, KubernetesAuthProvidersWithOptionsApi
{
  constructor(
    private readonly base: KubernetesAuthProvidersApi,
    private readonly gsAuthProvidersApi: GSAuthProvidersApi,
    private readonly hasUserGesture: () => boolean = defaultHasUserGesture,
  ) {}

  private isOidc(authProvider: string): boolean {
    return authProvider.startsWith(OIDC_AUTH_PROVIDER_PREFIX);
  }

  private async resolveOidcToken(
    authProvider: string,
    { minLifetimeLeft }: InstallationTokenOptions = {},
  ): Promise<string> {
    const providerName = authProvider.slice(OIDC_AUTH_PROVIDER_PREFIX.length);
    const authApi =
      await this.gsAuthProvidersApi.getKubernetesAuthApi(providerName);
    if (!authApi) {
      throw new Error(
        `OIDC auth provider "${providerName}" is not configured.`,
      );
    }
    // A token that has to last comes from the lasting tokens, any other from
    // the session as it is; the arguments pass on as given.
    const getIdToken = (...request: [AuthRequestOptions?]) =>
      minLifetimeLeft === undefined
        ? authApi.getIdToken(...request)
        : this.gsAuthProvidersApi.getLastingIdToken(
            providerName,
            minLifetimeLeft,
            ...request,
          );
    // Only a person's action may open the sign-in (Login Required), as in
    // the portal's fetch: a poll or a refetch takes the live session's token
    // or fails as session-expired. A sign-in the person's read opens is named
    // as the Kubernetes token's (`data-login-requested-by`).
    if (this.hasUserGesture()) {
      return asLoginRequestCaller('kubernetes-token', () => getIdToken());
    }
    const token = await getIdToken({ optional: true });
    if (!token) {
      throw new PortalSessionExpiredError();
    }
    return token;
  }

  async getCredentials(
    authProvider: string,
    options?: InstallationTokenOptions,
  ): Promise<{ token?: string }> {
    if (this.isOidc(authProvider)) {
      return { token: await this.resolveOidcToken(authProvider, options) };
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
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: ({ discoveryApi, fetchApi, kubernetesAuthProvidersApi }) =>
        new KubernetesClient({
          discoveryApi: discoveryApi as GSDiscoveryApiClient,
          fetchApi,
          kubernetesAuthProvidersApi,
        }),
    }),
});
