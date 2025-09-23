import { KubernetesRequestBody } from '@backstage/plugin-kubernetes-common';
import { OAuthApi, OpenIdConnectApi } from '@backstage/core-plugin-api';
import {
  AksKubernetesAuthProvider,
  GoogleKubernetesAuthProvider,
  OidcKubernetesAuthProvider,
  ServerSideKubernetesAuthProvider,
} from '@backstage/plugin-kubernetes-react';
import {
  KubernetesAuthProvider,
  PinnipedKubernetesAuthProvider,
} from './PinnipedKubernetesAuthProvider';
import { PinnipedSupervisorApi } from '../auth/pinniped/types';

export interface KubernetesAuthProvidersApi {
  decorateRequestBodyForAuth(
    authProvider: string,
    requestBody: KubernetesRequestBody,
    audience?: string,
  ): Promise<KubernetesRequestBody>;
  getCredentials(
    authProvider: string,
    audience?: string,
  ): Promise<{
    token?: string;
  }>;
}

/** @public */
export class KubernetesAuthProviders implements KubernetesAuthProvidersApi {
  private readonly kubernetesAuthProviderMap: Map<
    string,
    KubernetesAuthProvider
  >;

  constructor(options: {
    microsoftAuthApi: OAuthApi;
    googleAuthApi: OAuthApi;
    oidcProviders?: { [key: string]: OpenIdConnectApi };
    pinnipedProviders?: { [key: string]: PinnipedSupervisorApi };
  }) {
    this.kubernetesAuthProviderMap = new Map<string, KubernetesAuthProvider>();
    this.kubernetesAuthProviderMap.set(
      'google',
      new GoogleKubernetesAuthProvider(options.googleAuthApi),
    );
    this.kubernetesAuthProviderMap.set(
      'serviceAccount',
      new ServerSideKubernetesAuthProvider(),
    );
    this.kubernetesAuthProviderMap.set(
      'googleServiceAccount',
      new ServerSideKubernetesAuthProvider(),
    );
    this.kubernetesAuthProviderMap.set(
      'aws',
      new ServerSideKubernetesAuthProvider(),
    );
    this.kubernetesAuthProviderMap.set(
      'azure',
      new ServerSideKubernetesAuthProvider(),
    );
    this.kubernetesAuthProviderMap.set(
      'localKubectlProxy',
      new ServerSideKubernetesAuthProvider(),
    );
    this.kubernetesAuthProviderMap.set(
      'aks',
      new AksKubernetesAuthProvider(options.microsoftAuthApi),
    );

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

    if (options.pinnipedProviders) {
      Object.keys(options.pinnipedProviders).forEach(provider => {
        this.kubernetesAuthProviderMap.set(
          `pinniped.${provider}`,
          new PinnipedKubernetesAuthProvider(
            provider,
            options.pinnipedProviders![provider],
          ),
        );
      });
    }
  }

  async decorateRequestBodyForAuth(
    authProvider: string,
    requestBody: KubernetesRequestBody,
    audience: string,
  ): Promise<KubernetesRequestBody> {
    const kubernetesAuthProvider: KubernetesAuthProvider | undefined =
      this.kubernetesAuthProviderMap.get(authProvider);
    if (kubernetesAuthProvider) {
      return await kubernetesAuthProvider.decorateRequestBodyForAuth(
        requestBody,
        audience,
      );
    }

    if (authProvider.startsWith('oidc.')) {
      throw new Error(
        `KubernetesAuthProviders has no oidcProvider configured for ${authProvider}`,
      );
    }

    if (authProvider.startsWith('pinniped.')) {
      throw new Error(
        `KubernetesAuthProviders has no pinnipedProvider configured for ${authProvider}`,
      );
    }

    throw new Error(
      `authProvider "${authProvider}" has no KubernetesAuthProvider defined for it`,
    );
  }

  async getCredentials(
    authProvider: string,
    audience: string,
  ): Promise<{ token?: string }> {
    const kubernetesAuthProvider: KubernetesAuthProvider | undefined =
      this.kubernetesAuthProviderMap.get(authProvider);

    if (kubernetesAuthProvider) {
      return await kubernetesAuthProvider.getCredentials(audience);
    }

    if (authProvider.startsWith('oidc.')) {
      throw new Error(
        `KubernetesAuthProviders has no oidcProvider configured for ${authProvider}`,
      );
    }

    if (authProvider.startsWith('pinniped.')) {
      throw new Error(
        `KubernetesAuthProviders has no pinnipedProvider configured for ${authProvider}`,
      );
    }

    throw new Error(
      `authProvider "${authProvider}" has no KubernetesAuthProvider defined for it`,
    );
  }
}
