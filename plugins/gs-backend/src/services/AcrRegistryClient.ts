import { LoggerService } from '@backstage/backend-plugin-api';
import semver from 'semver';
import { RegistryAuthClient } from './RegistryAuthClient';
import { normalizeRegistry } from './registryUtils';

export interface TagInfo {
  tag: string;
  createdAt: string;
}

/**
 * ACR-specific tag response with extended metadata.
 * Reference: https://learn.microsoft.com/en-us/rest/api/registry-dataplane/container-registry/get-tags
 */
interface AcrTagListResponse {
  registry: string;
  imageName: string;
  tags: Array<{
    name: string;
    digest: string;
    createdTime: string;
    lastUpdateTime: string;
    changeableAttributes?: {
      deleteEnabled: boolean;
      writeEnabled: boolean;
      readEnabled: boolean;
      listEnabled: boolean;
    };
  }>;
}

/**
 * Client for interacting with Azure Container Registry using ACR-specific APIs.
 *
 * Reference: https://learn.microsoft.com/en-us/rest/api/registry-dataplane/container-registry/get-tags
 */
export class AcrRegistryClient {
  constructor(
    private readonly logger: LoggerService,
    private readonly authClient: RegistryAuthClient,
  ) {}

  /**
   * Fetches tags with their creation timestamps from an Azure Container Registry.
   * Returns only valid semver tags, sorted by version (newest first).
   *
   * Reference: https://learn.microsoft.com/en-us/rest/api/registry-dataplane/container-registry/get-tags
   *
   * @param registry - The ACR registry host (e.g., gsoci.azurecr.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @param options - Optional configuration
   * @param options.limit - Maximum number of tags to fetch (default: all)
   * @returns Array of tags, sorted by semver (newest first)
   */
  async getTags(
    registry: string,
    repository: string,
    options?: {
      limit?: number;
    },
  ): Promise<TagInfo[]> {
    const normalized = normalizeRegistry(registry);
    const url = new URL(`https://${normalized}/acr/v1/${repository}/_tags`);
    if (options?.limit) {
      url.searchParams.set('n', options.limit.toString());
    }
    // Order by most recent first
    url.searchParams.set('orderby', 'timedesc');

    this.logger.debug(`Fetching tags from ACR API: ${url.toString()}`);

    const response = await this.authClient.fetch(
      url.toString(),
      'application/json',
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch tags from ACR API ${url}: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as AcrTagListResponse;

    if (!data.tags || !Array.isArray(data.tags)) {
      return [];
    }

    // Filter to valid semver versions and map to TagInfo
    const validTags = data.tags.filter(tag => semver.valid(tag.name));
    const tagInfos: TagInfo[] = validTags.map(tag => ({
      tag: tag.name,
      createdAt: tag.createdTime,
    }));

    // Sort by semver (newest first)
    tagInfos.sort((a, b) => semver.rcompare(a.tag, b.tag));

    this.logger.info('Successfully fetched tags from ACR API', {
      registry: normalized,
      repository,
      totalTags: tagInfos.length,
    });

    return tagInfos;
  }
}
