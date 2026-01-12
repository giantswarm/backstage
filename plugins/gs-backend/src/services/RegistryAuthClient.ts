import { LoggerService } from '@backstage/backend-plugin-api';
import fetch, { Response } from 'node-fetch';

// Default timeout for HTTP requests (30 seconds)
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

// Token cache TTL (5 minutes)
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

interface WwwAuthenticateChallenge {
  realm: string;
  service: string;
  scope: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
}

/**
 * HTTP client for container registries with automatic authentication handling.
 *
 * Handles OAuth2 token-based authentication used by registries like
 * Azure Container Registry, GitHub Container Registry, etc.
 *
 * Tokens are cached to avoid unnecessary authentication requests.
 */
export class RegistryAuthClient {
  private readonly tokenCache = new Map<string, CachedToken>();

  constructor(
    private readonly logger: LoggerService,
    private readonly requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  /**
   * Performs a fetch request with automatic authentication handling.
   * First attempts without auth, then retries with a token if 401 is received.
   *
   * @param url - The URL to fetch
   * @param acceptHeader - The Accept header value for content negotiation
   * @returns The fetch Response
   */
  async fetch(url: string, acceptHeader: string): Promise<Response> {
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

      const tokenData = (await tokenResponse.json()) as TokenResponse;
      const token = tokenData.access_token;

      // Cache the token
      this.cacheToken(cacheKey, token);

      return token;
    } catch (error) {
      this.logger.warn(`Error getting anonymous token: ${error}`);
      return null;
    }
  }
}
