import { LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  NotAllowedError,
  NotFoundError,
  InputError,
  ConflictError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { RegistryAuthClient } from './RegistryAuthClient';
import { RegistryError } from './RegistryError';
import {
  getNextPageUrl,
  MAX_TAG_PAGES,
  normalizeRegistry,
  sortVersions,
} from './registryUtils';

/** The largest page ACR's `_tags` API serves; a bigger `n` is capped to it. */
const ACR_MAX_PAGE_SIZE = 999;

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
   * @param options.limit - Fetch only this many of the most recent tags (default: all)
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
    const limit = options?.limit;
    url.searchParams.set(
      'n',
      Math.min(limit ?? ACR_MAX_PAGE_SIZE, ACR_MAX_PAGE_SIZE).toString(),
    );
    // Order by most recent first
    url.searchParams.set('orderby', 'timedesc');

    let acrTags: AcrTagListResponse['tags'] = [];
    let pageUrl: string | undefined = url.toString();
    let pages = 0;
    while (
      pageUrl &&
      pages < MAX_TAG_PAGES &&
      (limit === undefined || acrTags.length < limit)
    ) {
      const page = await this.fetchTagPage(pageUrl, normalized, repository);
      acrTags.push(...page.tags);
      pages++;
      pageUrl = page.nextUrl;
    }
    if (limit !== undefined) {
      acrTags = acrTags.slice(0, limit);
    }

    if (pageUrl && pages >= MAX_TAG_PAGES) {
      this.logger.info('Stopped following ACR tag pages at the page limit', {
        registry: normalized,
        repository,
        pages,
      });
    }

    const createdTimes = new Map(
      acrTags.map(tag => [tag.name, tag.createdTime]),
    );
    const tagInfos: TagInfo[] = sortVersions(acrTags.map(tag => tag.name)).map(
      tag => ({ tag, createdAt: createdTimes.get(tag)! }),
    );

    this.logger.info('Successfully fetched tags from ACR API', {
      registry: normalized,
      repository,
      totalTags: tagInfos.length,
      pages,
    });

    return tagInfos;
  }

  private async fetchTagPage(
    url: string,
    normalized: string,
    repository: string,
  ): Promise<{
    tags: AcrTagListResponse['tags'];
    nextUrl: string | undefined;
  }> {
    this.logger.debug(`Fetching tags from ACR API: ${url}`);

    const response = await this.authClient.fetch(url, 'application/json');

    if (!response.ok) {
      const errorText = await response.text();
      const baseMessage = `Failed to fetch tags from ACR API for ${normalized}/${repository}`;
      const detailedMessage = `${baseMessage}. Status: ${response.status}${errorText ? `. ${errorText}` : '.'}`;

      switch (response.status) {
        case 400:
          throw new InputError(detailedMessage);
        case 401:
          throw new AuthenticationError(detailedMessage);
        case 403:
          throw new NotAllowedError(detailedMessage);
        case 404:
          throw new NotFoundError(detailedMessage);
        case 409:
          throw new ConflictError(detailedMessage);
        case 429:
          throw new RegistryError(
            `${baseMessage}: Rate limit exceeded`,
            429,
            errorText,
          );
        case 503:
          throw new ServiceUnavailableError(detailedMessage);
        default:
          if (response.status >= 500) {
            throw new ServiceUnavailableError(detailedMessage);
          }
          throw new RegistryError(detailedMessage, response.status, errorText);
      }
    }

    const data = (await response.json()) as AcrTagListResponse;

    return {
      tags: Array.isArray(data.tags) ? data.tags : [],
      nextUrl: getNextPageUrl(response, url),
    };
  }
}
