import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  TagManifestResponse,
  ContainerRegistryApi,
  TagsResponse,
} from './types';

/**
 * Client for interacting with the container registry backend API.
 */
export class ContainerRegistryClient implements ContainerRegistryApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async getTags(registry: string, repository: string): Promise<TagsResponse> {
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    const params = new URLSearchParams({
      registry,
      repository,
    });

    const response = await this.fetchApi.fetch(
      `${baseUrl}/container-registry/tags?${params.toString()}`,
    );

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch tags for  ${registry}/${repository}. Reason: ${response.statusText}.`,
      );
      error.name = response.status === 401 ? 'UnauthorizedError' : error.name;

      throw error;
    }

    return response.json();
  }

  async getTagManifest(
    registry: string,
    repository: string,
    tag: string,
  ): Promise<TagManifestResponse> {
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    const params = new URLSearchParams({
      registry,
      repository,
      tag,
    });

    const response = await this.fetchApi.fetch(
      `${baseUrl}/container-registry/tag-manifest?${params.toString()}`,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message ||
          `Failed to fetch tag manifest: ${response.statusText}`,
      );
    }

    return response.json();
  }
}
