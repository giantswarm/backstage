import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { GSServiceApi } from './types';

export class GSService implements GSServiceApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async updateClusters(
    installationName: string,
    kubernetesHeaders: Record<string, string>,
  ): Promise<void> {
    let baseUrl: string;
    try {
      DiscoveryApiClient.setInstallation(installationName);
      baseUrl = await this.discoveryApi.getBaseUrl('gs');
    } finally {
      DiscoveryApiClient.resetInstallation();
    }

    const response = await this.fetchApi
      .fetch(`${baseUrl}/update-clusters`, {
        method: 'POST',
        headers: kubernetesHeaders,
      })
      .catch(e => {
        throw new Error(`Failed to update clusters, ${e.message}`);
      });

    if (!response.ok) {
      throw new Error(
        `Failed to update clusters. Received http response ${response.status}: ${response.statusText}`,
      );
    }
  }
}
