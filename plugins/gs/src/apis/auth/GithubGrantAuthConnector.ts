import {
  AuthConnector,
  AuthConnectorCreateSessionOptions,
  AuthConnectorRefreshSessionOptions,
  OAuth2Session,
} from '@backstage/core-app-api';
import {
  BackstageIdentityApi,
  OpenIdConnectApi,
  ProfileInfoApi,
} from '@backstage/core-plugin-api';

/**
 * Header used by the frontend to forward the user's main Dex ID token, which
 * the backend exchanges through the muster token broker. Must match the
 * auth backend module's `SUBJECT_TOKEN_HEADER`.
 */
const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

/** The backend route minting and revoking the GitHub token. */
export const GITHUB_TOKEN_PATH = '/api/auth/github-token';

/**
 * sessionStorage key recording when this tab last bounced through muster's
 * GitHub connect, so a connect that comes back without a grant does not send
 * the browser round again forever.
 */
export const GITHUB_BOUNCE_STORAGE_KEY = 'gs.github.connect-bounce';

/** A bounce younger than this is not repeated; the caller sees an error instead. */
const BOUNCE_REPEAT_GUARD_MS = 2 * 60_000;

/**
 * Coarse reason why the GitHub token could not be minted, mirroring the
 * backend route's `reason` field.
 */
export type GithubTokenErrorReason =
  | 'no_grant'
  | 'session-expired'
  | 'broker_unreachable'
  | 'broker_client_invalid'
  | 'subject_invalid'
  | 'exchange_failed'
  | 'unknown';

/**
 * The person holds no GitHub grant in muster (yet). `authUrl` is muster's
 * connect URL: one full-page visit connects the account, for this and every
 * later session, and comes back to the page that needed the token.
 */
export class GithubTokenError extends Error {
  readonly name = 'GithubTokenError';
  constructor(
    readonly reason: GithubTokenErrorReason,
    message?: string,
    readonly authUrl?: string,
  ) {
    super(message ?? `GitHub token request failed: ${reason}`);
  }
}

const GITHUB_TOKEN_ERROR_REASONS: ReadonlySet<string> = new Set([
  'no_grant',
  'broker_unreachable',
  'broker_client_invalid',
  'subject_invalid',
  'exchange_failed',
]);

async function readGithubTokenError(
  response: Response,
): Promise<GithubTokenError> {
  let reason: GithubTokenErrorReason =
    response.status >= 500 ? 'broker_unreachable' : 'exchange_failed';
  let message: string | undefined;
  let authUrl: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: string;
      reason?: string;
      authUrl?: string;
    };
    if (body.reason && GITHUB_TOKEN_ERROR_REASONS.has(body.reason)) {
      reason = body.reason as GithubTokenErrorReason;
    }
    if (typeof body.error === 'string') {
      message = body.error;
    }
    if (typeof body.authUrl === 'string' && body.authUrl !== '') {
      authUrl = body.authUrl;
    }
  } catch {
    // Not JSON; the status decides.
  }
  return new GithubTokenError(reason, message, authUrl);
}

/**
 * Appends `redirect=<back>` to muster's connect URL
 * (`/oauth/proxy/start?state=…`), so the callback returns the browser to the
 * page that needed the token. muster validates the target against its
 * `postLoginRedirectAllowlist` and appends `server=<name>` on the way back.
 */
export function withRedirectBack(authUrl: string, back: string): string {
  const url = new URL(authUrl);
  url.searchParams.set('redirect', back);
  return url.toString();
}

/**
 * Remembers bounces in sessionStorage so a connect that did not produce a
 * grant is not repeated in a loop. sessionStorage may be unavailable
 * (blocked site data); then every bounce is allowed.
 */
export interface BounceGuard {
  /** Whether a bounce may start now (none recorded recently). */
  allow(): boolean;
  /** Record that a bounce starts now. */
  record(): void;
  /** Forget the record (a token was minted, so the connect worked). */
  clear(): void;
}

export class SessionStorageBounceGuard implements BounceGuard {
  constructor(
    private readonly storage: () => Storage | undefined = () => {
      try {
        return typeof window === 'undefined'
          ? undefined
          : window.sessionStorage;
      } catch {
        return undefined;
      }
    },
    private readonly now: () => number = () => Date.now(),
  ) {}

  allow(): boolean {
    const raw = this.storage()?.getItem(GITHUB_BOUNCE_STORAGE_KEY);
    if (!raw) {
      return true;
    }
    const at = Number(raw);
    return !Number.isFinite(at) || this.now() - at > BOUNCE_REPEAT_GUARD_MS;
  }

  record(): void {
    this.storage()?.setItem(GITHUB_BOUNCE_STORAGE_KEY, String(this.now()));
  }

  clear(): void {
    this.storage()?.removeItem(GITHUB_BOUNCE_STORAGE_KEY);
  }
}

export type GithubGrantAuthConnectorOptions = {
  /** `backend.baseUrl`; the token route is served by the main backend. */
  backendBaseUrl: string;
  /**
   * The main login provider's API: its ID token is the broker's subject
   * token, its Backstage token authenticates the route, its profile is what
   * the settings card shows for "GitHub".
   */
  mainAuthApi: OpenIdConnectApi & BackstageIdentityApi & ProfileInfoApi;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Defaults to a full-page navigation of the current window. */
  navigate?: (url: string) => void;
  /** Defaults to the current window location. */
  currentUrl?: () => string;
  /** Defaults to a sessionStorage-backed guard. */
  bounceGuard?: BounceGuard;
};

/**
 * `AuthConnector` for Backstage's standard `githubAuthApiRef` on the person's
 * own GitHub grant in muster. There is no GitHub OAuth flow in the portal:
 *
 * - `refreshSession` and `createSession` mint from `POST /api/auth/github-token`,
 *   which exchanges the person's Dex ID token through muster's token broker
 *   for the grant's access token. The requested scopes are echoed as granted
 *   (a GitHub App user token carries none), and `expiresAt` is the token's
 *   remaining lifetime, so `OAuth2` re-mints three minutes before it ends
 *   while muster refreshes the grant underneath.
 * - When the person holds no grant, `createSession` sends the browser
 *   through muster's connect once (a full-page redirect that returns to the
 *   current page; GitHub redirects straight back for an App the person
 *   already authorized at their login). No "Login Required" dialog, no
 *   popup. A bounce that comes back without a grant is not repeated: the
 *   consumer gets the error instead.
 * - `removeSession` revokes the grant in muster (`core_auth_logout`) for
 *   every session and every server of that issuer.
 */
export class GithubGrantAuthConnector implements AuthConnector<OAuth2Session> {
  private readonly backendBaseUrl: string;
  private readonly mainAuthApi: OpenIdConnectApi &
    BackstageIdentityApi &
    ProfileInfoApi;
  private readonly fetchFn: typeof fetch;
  private readonly navigate: (url: string) => void;
  private readonly currentUrl: () => string;
  private readonly bounceGuard: BounceGuard;

  constructor(options: GithubGrantAuthConnectorOptions) {
    this.backendBaseUrl = options.backendBaseUrl;
    this.mainAuthApi = options.mainAuthApi;
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
    this.navigate = options.navigate ?? (url => window.location.assign(url));
    this.currentUrl = options.currentUrl ?? (() => window.location.href);
    this.bounceGuard = options.bounceGuard ?? new SessionStorageBounceGuard();
  }

  async createSession(
    options: AuthConnectorCreateSessionOptions,
  ): Promise<OAuth2Session> {
    try {
      return await this.mint(options.scopes);
    } catch (error) {
      if (
        error instanceof GithubTokenError &&
        error.reason === 'no_grant' &&
        error.authUrl
      ) {
        if (!this.bounceGuard.allow()) {
          throw new GithubTokenError(
            'no_grant',
            'GitHub is not connected in muster: the connect did not produce a grant. Connect GitHub in muster and reload.',
            error.authUrl,
          );
        }
        this.bounceGuard.record();
        this.navigate(withRedirectBack(error.authUrl, this.currentUrl()));
        // The page is navigating away; nothing to resolve.
        return new Promise(() => {});
      }
      throw error;
    }
  }

  async refreshSession(
    options?: AuthConnectorRefreshSessionOptions,
  ): Promise<OAuth2Session> {
    return this.mint(options?.scopes);
  }

  async removeSession(): Promise<void> {
    const { token, subjectToken } = await this.credentials();
    const response = await this.fetchFn(
      `${this.backendBaseUrl}${GITHUB_TOKEN_PATH}/logout`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          [SUBJECT_TOKEN_HEADER]: subjectToken,
        },
      },
    ).catch(error => {
      throw new Error(`GitHub sign-out request failed, ${error}`);
    });
    if (!response.ok) {
      const error: any = new Error(
        `GitHub sign-out request failed, ${response.statusText}`,
      );
      error.status = response.status;
      throw error;
    }
  }

  private async credentials(): Promise<{
    token: string;
    subjectToken: string;
  }> {
    let subjectToken: string;
    let identity: Awaited<
      ReturnType<BackstageIdentityApi['getBackstageIdentity']>
    >;
    try {
      // The non-optional getters trigger the single main Dex login when the
      // main session is gone -- the only popup this connector ever causes.
      subjectToken = await this.mainAuthApi.getIdToken();
      identity = await this.mainAuthApi.getBackstageIdentity();
    } catch (error) {
      throw new GithubTokenError(
        'session-expired',
        'Main session expired and re-login did not complete',
      );
    }
    if (!subjectToken || !identity) {
      throw new GithubTokenError('session-expired');
    }
    return { token: identity.token, subjectToken };
  }

  private async mint(scopes?: Set<string>): Promise<OAuth2Session> {
    const { token, subjectToken } = await this.credentials();

    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.backendBaseUrl}${GITHUB_TOKEN_PATH}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            [SUBJECT_TOKEN_HEADER]: subjectToken,
          },
        },
      );
    } catch (error) {
      throw new GithubTokenError(
        'broker_unreachable',
        `GitHub token request failed: ${error}`,
      );
    }
    if (!response.ok) {
      throw await readGithubTokenError(response);
    }

    const body = (await response.json()) as {
      token?: string;
      expiresInSeconds?: number;
    };
    if (!body.token) {
      throw new GithubTokenError('exchange_failed');
    }
    this.bounceGuard.clear();

    const profile =
      (await this.mainAuthApi.getProfile({ optional: true })) ?? {};

    return {
      providerInfo: {
        idToken: '',
        accessToken: body.token,
        // A GitHub App user access token carries no scopes; the grant is the
        // App's permissions. Echo what was asked so the session satisfies
        // the consumer's request.
        scopes: new Set(scopes ?? []),
        expiresAt: body.expiresInSeconds
          ? new Date(Date.now() + body.expiresInSeconds * 1000)
          : undefined,
      },
      profile,
    };
  }
}
