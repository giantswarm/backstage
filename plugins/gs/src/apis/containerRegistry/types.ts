import { createApiRef } from '@backstage/core-plugin-api';

/**
 * Response from the container registry tags endpoint.
 */
export interface TagsResponse {
  tags: string[];
  latestStableVersion: string | null;
}

/**
 * Response from the container registry tag manifest endpoint.
 */
export interface TagManifestResponse {
  annotations: Record<string, string>;
}

/**
 * API interface for interacting with container registries.
 */
export interface ContainerRegistryApi {
  /**
   * Fetches tags from a container registry for a given repository.
   *
   * @param registry - The container registry (e.g., ghcr.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @returns Object containing sorted tags and the latest stable version
   */
  getTags(registry: string, repository: string): Promise<TagsResponse>;

  /**
   * Fetches the manifest for a specific tag from a container registry.
   *
   * @param registry - The container registry (e.g., ghcr.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @param tag - The tag to fetch the manifest for (e.g., 1.0.0)
   * @returns Object containing the manifest raw content
   */
  getTagManifest(
    registry: string,
    repository: string,
    tag: string,
  ): Promise<TagManifestResponse>;
}

/**
 * API reference for the container registry API.
 */
export const containerRegistryApiRef = createApiRef<ContainerRegistryApi>({
  id: 'plugin.gs.container-registry',
});
