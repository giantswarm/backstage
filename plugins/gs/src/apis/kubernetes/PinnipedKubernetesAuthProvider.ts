import { JsonObject } from '@backstage/types';
import { KubernetesRequestBody } from '@backstage/plugin-kubernetes-common';
import { PinnipedSupervisorApi } from '../auth/pinniped/types';

export interface KubernetesAuthProvider {
  decorateRequestBodyForAuth(
    requestBody: KubernetesRequestBody,
    audience: string,
  ): Promise<KubernetesRequestBody>;
  getCredentials(audience: string): Promise<{
    token?: string;
  }>;
}

export class PinnipedKubernetesAuthProvider implements KubernetesAuthProvider {
  providerName: string;
  authProvider: PinnipedSupervisorApi;

  constructor(providerName: string, authProvider: PinnipedSupervisorApi) {
    this.providerName = providerName;
    this.authProvider = authProvider;
  }

  async decorateRequestBodyForAuth(
    requestBody: KubernetesRequestBody,
    audience: string,
  ): Promise<KubernetesRequestBody> {
    const authToken: string = (await this.getCredentials(audience)).token;
    const auth = { ...(requestBody.auth as JsonObject) };
    if (auth.pinniped) {
      (auth.pinniped as JsonObject)[this.providerName] = authToken;
    } else {
      auth.pinniped = { [this.providerName]: authToken };
    }
    requestBody.auth = auth;
    return requestBody;
  }

  async getCredentials(audience: string): Promise<{ token: string }> {
    return {
      token: await this.authProvider.getClusterScopedIdToken(audience),
    };
  }
}
