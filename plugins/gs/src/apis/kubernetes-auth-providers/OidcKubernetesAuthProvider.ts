import { OpenIdConnectApi } from '@backstage/core-plugin-api';
import { KubernetesAuthProvider } from './types';

/** @public */
export class OidcKubernetesAuthProvider implements KubernetesAuthProvider {
  providerName: string;
  authProvider: OpenIdConnectApi;

  constructor(providerName: string, authProvider: OpenIdConnectApi) {
    this.providerName = providerName;
    this.authProvider = authProvider;
  }

  async getCredentials(): Promise<{ token: string }> {
    return {
      token: await this.authProvider.getIdToken(),
    };
  }
}
