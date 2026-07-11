/**
 * Header used by the frontend to forward the user's main Dex ID token, which
 * the backend exchanges for a downstream token. Backstage does not expose
 * provider sessions server-side, so the token travels alongside the regular
 * Backstage credentials.
 */
export const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

export const TOKEN_EXCHANGE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:token-exchange';
export const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

/**
 * Minimum remaining lifetime before a cached token is re-exchanged. Larger than
 * the frontend's session refresh margin (3 minutes) so a refresh-triggering
 * request never gets a token that immediately triggers another refresh.
 */
export const EXPIRY_SKEW_SECONDS = 240;

/** Fallback lifetime when the exchange response carries no expires_in. */
export const DEFAULT_EXPIRES_IN_SECONDS = 300;

/**
 * Extracts the OAuth 2.0 `error` code (RFC 6749 section 5.2) from an error
 * response body. Returns undefined for non-JSON bodies (e.g. an HTML error page
 * from a proxy sitting in front of the token endpoint).
 */
export function parseOAuthError(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}

type CacheEntry = {
  token: string;
  expiresAt: number;
};

/**
 * In-memory cache of exchanged tokens keyed by an arbitrary string (per user,
 * or per user and installation). Serves a token only while it stays beyond the
 * re-exchange skew, and prunes expired entries on every read. Tokens are never
 * persisted.
 */
export class TokenExchangeCache {
  private readonly entries = new Map<string, CacheEntry>();

  /**
   * Returns a still-fresh token for `key` (remaining lifetime above the
   * re-exchange skew), or undefined when absent or too close to expiry. Prunes
   * fully expired entries as a side effect.
   */
  getFresh(
    key: string,
    now: number,
  ): { token: string; expiresInSeconds: number } | undefined {
    for (const [entryKey, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(entryKey);
      }
    }

    const cached = this.entries.get(key);
    if (cached && cached.expiresAt - now > EXPIRY_SKEW_SECONDS * 1000) {
      return {
        token: cached.token,
        expiresInSeconds: Math.floor((cached.expiresAt - now) / 1000),
      };
    }
    return undefined;
  }

  set(key: string, token: string, expiresInSeconds: number, now: number): void {
    this.entries.set(key, {
      token,
      expiresAt: now + expiresInSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
