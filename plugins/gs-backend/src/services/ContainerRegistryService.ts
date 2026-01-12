import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';
import { AcrRegistryClient } from './AcrRegistryClient';
import {
  OciDescriptor,
  OciImageManifest,
  OciRegistryClient,
  TagManifestResult,
} from './OciRegistryClient';
import { RegistryAuthClient } from './RegistryAuthClient';
import { findLatestStableVersion, normalizeRegistry } from './registryUtils';

export interface TagInfo {
  tag: string;
  createdAt: string | null;
}

export interface TagsResult {
  tags: TagInfo[];
  latestStableVersion: string | null;
}

// Re-export types for convenience
export type { OciDescriptor, OciImageManifest, TagManifestResult };

/**
 * Service for interacting with container registries.
 *
 * Provides a unified interface for both standard OCI Distribution Spec operations
 * and ACR-specific operations.
 */
export class ContainerRegistryService {
  private readonly ociClient: OciRegistryClient;
  private readonly acrClient: AcrRegistryClient;

  static create(options: { logger: LoggerService }) {
    return new ContainerRegistryService(options.logger);
  }

  private constructor(logger: LoggerService) {
    const authClient = new RegistryAuthClient(logger);
    this.ociClient = new OciRegistryClient(logger, authClient);
    this.acrClient = new AcrRegistryClient(logger, authClient);
  }

  /**
   * Fetches tags from a container registry for a given repository.
   *
   * For Azure Container Registry (ACR), uses the ACR-specific API that returns
   * creation times in a single request.
   *
   * For other registries, uses the standard OCI Distribution Spec.
   *
   * @param registry - The registry host (e.g., ghcr.io, docker.io, gsoci.azurecr.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @param options - Optional configuration
   * @param options.limit - Maximum number of tags to fetch (only supported for ACR)
   * @returns Object containing tags and the latest stable version
   */
  async getTags(
    registry: string,
    repository: string,
    options?: {
      limit?: number;
    },
  ): Promise<TagsResult> {
    const normalized = normalizeRegistry(registry);

    let tags: TagInfo[];

    if (this.isAzureContainerRegistry(normalized)) {
      // ACR returns tags with createdAt
      tags = await this.acrClient.getTags(registry, repository, options);
    } else {
      // OCI returns tags without createdAt, add null createdAt
      const ociTags = await this.ociClient.getTags(registry, repository);
      tags = ociTags.map(t => ({ tag: t.tag, createdAt: null }));
    }

    const latestStableVersion = findLatestStableVersion(tags.map(t => t.tag));

    return {
      tags,
      latestStableVersion,
    };
  }

  /**
   * Fetches the manifest for a specific tag from a container registry.
   * Uses the standard OCI Distribution Spec.
   *
   * @param registry - The registry host (e.g., ghcr.io, docker.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @param tag - The tag to fetch the manifest for (e.g., 1.0.0)
   * @returns Object containing the manifest raw content
   */
  async getTagManifest(
    registry: string,
    repository: string,
    tag: string,
  ): Promise<TagManifestResult> {
    return this.ociClient.getTagManifest(registry, repository, tag);
  }

  /**
   * Checks if the registry is an Azure Container Registry.
   */
  private isAzureContainerRegistry(registry: string): boolean {
    return registry.endsWith('.azurecr.io');
  }
}

export const containerRegistryServiceRef = createServiceRef<
  Expand<ContainerRegistryService>
>({
  id: 'container-registry',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
      },
      async factory(deps) {
        return ContainerRegistryService.create(deps);
      },
    }),
});
