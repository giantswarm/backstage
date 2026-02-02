import { LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  NotAllowedError,
  NotFoundError,
  InputError,
  ConflictError,
  ServiceUnavailableError,
} from '@backstage/errors';
import semver from 'semver';
import { RegistryAuthClient } from './RegistryAuthClient';
import { RegistryError } from './RegistryError';
import { normalizeRegistry, sortVersions } from './registryUtils';

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
   *
   * @param registry - The registry host (e.g., ghcr.io, docker.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @returns Array of tag info objects sorted by semver (newest first)
   */
  async getTags(registry: string, repository: string): Promise<TagInfo[]> {
    const normalized = normalizeRegistry(registry);
    const url = `https://${normalized}/v2/${repository}/tags/list`;

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

    if (!data.tags || !Array.isArray(data.tags)) {
      return [];
    }

    // Filter to only valid semver versions and sort
    const validTags = data.tags.filter(tag => semver.valid(tag));
    const sortedTags = sortVersions(validTags);

    this.logger.info('Successfully fetched tags from OCI registry', {
      registry: normalized,
      repository,
      totalTags: data.tags.length,
      validSemverTags: sortedTags.length,
    });

    return sortedTags.map(tag => ({ tag }));
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
}
