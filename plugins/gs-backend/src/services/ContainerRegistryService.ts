import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';
import fetch, { Response } from 'node-fetch';
import semver from 'semver';

// Default timeout for HTTP requests (30 seconds)
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

// Token cache TTL (5 minutes)
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

export interface TagsResult {
  tags: string[];
  latestStableVersion: string | null;
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

interface AcrTokenResponse {
  access_token: string;
}

interface WwwAuthenticateChallenge {
  realm: string;
  service: string;
  scope: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Service for interacting with OCI registries.
 *
 * Uses the OCI Distribution Spec.
 * Reference: https://github.com/opencontainers/distribution-spec/blob/main/spec.md
 */
export class ContainerRegistryService {
  private readonly tokenCache = new Map<string, CachedToken>();

  static create(options: { logger: LoggerService }) {
    return new ContainerRegistryService(options.logger);
  }

  private constructor(
    private readonly logger: LoggerService,
    private readonly requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  /**
   * Fetches tags from a container registry for a given repository.
   *
   * @param registry - The registry host (e.g., ghcr.io, docker.io)
   * @param repository - The repository path (e.g., giantswarm/my-app)
   * @returns Object containing sorted tags and the latest stable version
   */
  async getTags(registry: string, repository: string): Promise<TagsResult> {
    const normalizedRegistry = this.normalizeRegistry(registry);
    const url = `https://${normalizedRegistry}/v2/${repository}/tags/list`;

    this.logger.debug(`Fetching tags from OCI registry: ${url}`);

    const response = await this.fetchWithAuth(
      url,
      normalizedRegistry,
      repository,
      'application/json',
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch tags from ${url}: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as TagListResponse;

    if (!data.tags || !Array.isArray(data.tags)) {
      return {
        tags: [],
        latestStableVersion: null,
      };
    }

    // Filter to only valid semver versions and sort
    const validTags = data.tags.filter(tag => semver.valid(tag));
    const sortedTags = this.sortVersions(validTags);

    // Find the latest stable (non-prerelease) version
    const latestStableVersion = this.findLatestStableVersion(sortedTags);

    this.logger.info('Successfully fetched tags from OCI registry', {
      registry: normalizedRegistry,
      repository,
      totalTags: data.tags.length,
      validSemverTags: sortedTags.length,
      latestStableVersion,
    });

    return {
      tags: sortedTags,
      latestStableVersion,
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
    const normalizedRegistry = this.normalizeRegistry(registry);
    const manifestUrl = `https://${normalizedRegistry}/v2/${repository}/manifests/${tag}`;

    this.logger.debug(`Fetching manifest from OCI registry: ${manifestUrl}`);

    // Accept headers for different manifest types
    const acceptHeaders = [
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.index.v1+json',
    ].join(', ');

    const response = await this.fetchWithAuth(
      manifestUrl,
      normalizedRegistry,
      repository,
      acceptHeaders,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch manifest from ${manifestUrl}: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const manifest = (await response.json()) as TagManifestResult;

    this.logger.info('Successfully fetched manifest from OCI registry', {
      registry: normalizedRegistry,
      repository,
      tag,
      mediaType: manifest.mediaType,
    });

    return manifest;
  }

  /**
   * Performs a fetch request with automatic authentication handling.
   * First attempts without auth, then retries with a token if 401 is received.
   */
  private async fetchWithAuth(
    url: string,
    _registry: string,
    _repository: string,
    acceptHeader: string,
  ): Promise<Response> {
    // First, try without authentication
    let response = await this.fetchWithTimeout(url, {
      headers: { Accept: acceptHeader },
    });

    // If we get a 401, try to get an anonymous token and retry
    if (response.status === 401) {
      const wwwAuthenticate = response.headers.get('www-authenticate');
      if (wwwAuthenticate) {
        this.logger.debug(
          'Registry requires authentication, attempting to get anonymous token',
        );
        const token = await this.getAnonymousToken(wwwAuthenticate);

        if (token) {
          response = await this.fetchWithTimeout(url, {
            headers: {
              Accept: acceptHeader,
              Authorization: `Bearer ${token}`,
            },
          });
        }
      }
    }

    return response;
  }

  /**
   * Performs a fetch request with a timeout.
   */
  private async fetchWithTimeout(
    url: string,
    options: { headers: Record<string, string> },
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parses the WWW-Authenticate header to extract the authentication challenge.
   *
   * Example header: Bearer realm="https://gsoci.azurecr.io/oauth2/token",service="gsoci.azurecr.io",scope="repository:charts/giantswarm/ingress-nginx:metadata_read"
   */
  private parseWwwAuthenticate(
    header: string,
  ): WwwAuthenticateChallenge | null {
    const match = header.match(/Bearer\s+(.+)/i);
    if (!match) {
      return null;
    }

    const params: Record<string, string> = {};
    const paramsString = match[1];

    // Parse key="value" pairs
    const regex = /(\w+)="([^"]+)"/g;
    let paramMatch = regex.exec(paramsString);
    while (paramMatch !== null) {
      params[paramMatch[1]] = paramMatch[2];
      paramMatch = regex.exec(paramsString);
    }

    if (!params.realm || !params.service || !params.scope) {
      return null;
    }

    return {
      realm: params.realm,
      service: params.service,
      scope: params.scope,
    };
  }

  /**
   * Gets the cache key for a token based on the WWW-Authenticate challenge.
   */
  private getTokenCacheKey(challenge: WwwAuthenticateChallenge): string {
    return `${challenge.service}:${challenge.scope}`;
  }

  /**
   * Gets a cached token if it exists and is not expired.
   */
  private getCachedToken(cacheKey: string): string | null {
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Using cached token for: ${cacheKey}`);
      return cached.token;
    }
    if (cached) {
      this.tokenCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Caches a token with a TTL.
   */
  private cacheToken(cacheKey: string, token: string): void {
    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    });
  }

  /**
   * Gets an anonymous access token from the registry's OAuth2 endpoint.
   * This is required for registries like Azure Container Registry that
   * require authentication even for public repositories.
   *
   * Tokens are cached to avoid unnecessary requests.
   */
  private async getAnonymousToken(
    wwwAuthenticate: string,
  ): Promise<string | null> {
    const challenge = this.parseWwwAuthenticate(wwwAuthenticate);

    if (!challenge) {
      this.logger.warn(
        `Could not parse WWW-Authenticate header: ${wwwAuthenticate}`,
      );
      return null;
    }

    // Check cache first
    const cacheKey = this.getTokenCacheKey(challenge);
    const cachedToken = this.getCachedToken(cacheKey);
    if (cachedToken) {
      return cachedToken;
    }

    // Build the token request URL
    const tokenUrl = new URL(challenge.realm);
    tokenUrl.searchParams.set('service', challenge.service);
    tokenUrl.searchParams.set('scope', challenge.scope);

    this.logger.debug(
      `Requesting anonymous token from: ${tokenUrl.toString()}`,
    );

    try {
      const tokenResponse = await this.fetchWithTimeout(tokenUrl.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (!tokenResponse.ok) {
        this.logger.warn(
          `Failed to get anonymous token: ${tokenResponse.status} ${tokenResponse.statusText}`,
        );
        return null;
      }

      const tokenData = (await tokenResponse.json()) as AcrTokenResponse;
      const token = tokenData.access_token;

      // Cache the token
      this.cacheToken(cacheKey, token);

      return token;
    } catch (error) {
      this.logger.warn(`Error getting anonymous token: ${error}`);
      return null;
    }
  }

  /**
   * Normalizes the registry URL by removing protocol prefix if present.
   */
  private normalizeRegistry(registry: string): string {
    return registry.replace(/^https?:\/\//, '');
  }

  /**
   * Sorts versions in descending order (newest first) using semver.
   * Returns a new array without mutating the input.
   */
  private sortVersions(versions: string[]): string[] {
    return [...versions].sort((a, b) => semver.rcompare(a, b));
  }

  /**
   * Finds the latest stable version (non-prerelease) from a sorted list of versions.
   */
  private findLatestStableVersion(sortedVersions: string[]): string | null {
    for (const version of sortedVersions) {
      const parsed = semver.parse(version);
      if (parsed && parsed.prerelease.length === 0) {
        return version;
      }
    }
    return sortedVersions[0] ?? null;
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
