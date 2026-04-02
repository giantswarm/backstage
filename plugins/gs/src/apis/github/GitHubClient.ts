import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { GitHubApi } from './types';

/**
 * Client for fetching content from GitHub repositories via the backend.
 */
export class GitHubClient implements GitHubApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async fetchRawContent(url: string): Promise<string | null> {
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    const params = new URLSearchParams({ url });

    const response = await this.fetchApi.fetch(
      `${baseUrl}/github/raw-content?${params.toString()}`,
    );

    if (!response.ok) {
      return null;
    }

    return response.text();
  }
}
