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

/**
 * Page size asked of `tags/list`. The reference registry (distribution)
 * rejects a larger `n` by default.
 */
const OCI_PAGE_SIZE = 1000;

export interface TagInfo {
  tag: string;
}

/**
 * Descriptor for a blob or manifest in an OCI registry.
 */
export interface OciDescriptor {
  mediaType: string;
  size: number;
  digest: string;
  annotations?: Record<string, string>;
}

/**
 * OCI Image Manifest (single image).
 * Reference: https://github.com/opencontainers/image-spec/blob/main/manifest.md
 */
export interface OciImageManifest {
  schemaVersion: 2;
  mediaType: 'application/vnd.oci.image.manifest.v1+json';
  config: OciDescriptor;
  layers: OciDescriptor[];
  annotations?: Record<string, string>;
}

/**
 * Union type for all supported manifest formats.
 */
export type TagManifestResult = OciImageManifest;

interface TagListResponse {
  name: string;
  tags: string[];
}

/**
 * Client for interacting with OCI registries using the OCI Distribution Spec.
 * Reference: https://github.com/opencontainers/distribution-spec/blob/main/spec.md
 */
export class OciRegistryClient {
  constructor(
    private readonly logger: LoggerService,
    private readonly authClient: RegistryAuthClient,
  ) {}

  /**
   * Fetches tags from a container registry for a given repository.
   * Returns only valid semver tags, sorted by version (newest first).
   * Follows the registry's pagination until every tag is listed.
   *
   * @param registry - The registry host (e.g., ghcr.io, docker.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @param options - Optional configuration
   * @param options.limit - Fetch only this many tags (default: all). The registry lists tags in lexical order, so these are not necessarily the most recent ones.
   * @returns Array of tag info objects sorted by semver (newest first)
   */
  async getTags(
    registry: string,
    repository: string,
    options?: {
      limit?: number;
    },
  ): Promise<TagInfo[]> {
    const normalized = normalizeRegistry(registry);
    const limit = options?.limit;
    const url = new URL(`https://${normalized}/v2/${repository}/tags/list`);
    url.searchParams.set(
      'n',
      Math.min(limit ?? OCI_PAGE_SIZE, OCI_PAGE_SIZE).toString(),
    );

    let tags: string[] = [];
    let pageUrl: string | undefined = url.toString();
    let pages = 0;
    while (
      pageUrl &&
      pages < MAX_TAG_PAGES &&
      (limit === undefined || tags.length < limit)
    ) {
      const page = await this.fetchTagPage(pageUrl, normalized, repository);
      tags.push(...page.tags);
      pages++;
      pageUrl = page.nextUrl;
    }
    if (limit !== undefined) {
      tags = tags.slice(0, limit);
    }

    if (pageUrl && pages >= MAX_TAG_PAGES) {
      this.logger.info('Stopped following OCI tag pages at the page limit', {
        registry: normalized,
        repository,
        pages,
      });
    }

    const sortedTags = sortVersions(tags);

    this.logger.info('Successfully fetched tags from OCI registry', {
      registry: normalized,
      repository,
      totalTags: tags.length,
      validSemverTags: sortedTags.length,
      pages,
    });

    return sortedTags.map(tag => ({ tag }));
  }

  private async fetchTagPage(
    url: string,
    normalized: string,
    repository: string,
  ): Promise<{ tags: string[]; nextUrl: string | undefined }> {
    this.logger.debug(`Fetching tags from OCI registry: ${url}`);

    const response = await this.authClient.fetch(url, 'application/json');

    if (!response.ok) {
      const errorText = await response.text();
      const baseMessage = `Failed to fetch tags from OCI registry for ${normalized}/${repository}`;
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

    const data = (await response.json()) as TagListResponse;

    return {
      tags: Array.isArray(data.tags) ? data.tags : [],
      nextUrl: getNextPageUrl(response, url),
    };
  }

  /**
   * Fetches the manifest for a specific tag from a container registry.
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
    const normalized = normalizeRegistry(registry);
    const manifestUrl = `https://${normalized}/v2/${repository}/manifests/${tag}`;

    this.logger.debug(`Fetching manifest from OCI registry: ${manifestUrl}`);

    // Accept headers for different manifest types
    const acceptHeaders = [
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.index.v1+json',
    ].join(', ');

    const response = await this.authClient.fetch(manifestUrl, acceptHeaders);

    if (!response.ok) {
      const errorText = await response.text();
      const baseMessage = `Failed to fetch manifest from OCI registry for ${normalized}/${repository}:${tag}`;
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

    const manifest = (await response.json()) as TagManifestResult;

    this.logger.info('Successfully fetched manifest from OCI registry', {
      registry: normalized,
      repository,
      tag,
      mediaType: manifest.mediaType,
    });

    return manifest;
  }

  /**
   * Checks whether a tag exists in a repository. A missing repository counts
   * as a missing tag; any other registry error is thrown.
   *
   * @param registry - The registry host (e.g., ghcr.io, docker.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @param tag - The tag to look for (e.g., 1.0.0)
   */
  async tagExists(
    registry: string,
    repository: string,
    tag: string,
  ): Promise<boolean> {
    try {
      await this.getTagManifest(registry, repository, tag);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
