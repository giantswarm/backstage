import { DiscoveryApi } from '@backstage/core-plugin-api';
import {
  AuthService,
  BackstageCredentials,
} from '@backstage/backend-plugin-api';
import fetch from 'node-fetch';

export class KubernetesResourceFetcher {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly auth: AuthService,
  ) {}

  async proxyKubernetesRequest(options: {
    clusterName: string;
    path: string;
    credentials: BackstageCredentials;
    headers?: [string, string][];
  }): Promise<any> {
    const { path, headers = [] } = options;

    const credentials =
      options.credentials ?? (await this.auth.getOwnServiceCredentials());

    const baseUrl = await this.discoveryApi.getBaseUrl('kubernetes');
    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'kubernetes',
    });

    const response = await fetch(`${baseUrl}/proxy${path}`, {
      headers: [['Authorization', `Bearer ${token}`], ...headers],
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Kubernetes resources: ${response.statusText}, ${response.status}, ${response.body}`,
      );
    }

    return await response.json();
  }
}
