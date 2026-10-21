import { AuthRequestOptions, SessionState } from '@backstage/core-plugin-api';
import {
  hasIdTokenLifetimeLeft,
  idTokenExpiresAt,
  idTokenLifetimeLeft,
} from '@giantswarm/backstage-plugin-gs-react';
import { AuthApi } from './types';

type Options = {
  /** The OAuth2 API whose session the tokens belong to. */
  authApi: Pick<AuthApi, 'getIdToken' | 'sessionState$'>;
  /**
   * Refreshes that session silently and resolves its new ID token: the
   * connector's `refreshSession`, which OAuth2 itself refreshes through (the
   * session's refresh token, or a new cluster token exchange). Never a
   * sign-in.
   */
  refresh: (minLifetimeLeft: number) => Promise<string>;
};

/** Whichever of two JWTs expires later; the first when neither says. */
function laterExpiring(a: string, b: string): string {
  const aExpiresAt = idTokenExpiresAt(a)?.getTime() ?? Infinity;
  const bExpiresAt = idTokenExpiresAt(b)?.getTime() ?? -Infinity;
  return aExpiresAt >= bExpiresAt ? a : b;
}

/**
 * ID tokens of one OAuth2 API with most of their lifetime still ahead, for a
 * request whose receiver holds on to the token for as long as the work it
 * starts runs: an agent turn, whose token the kagent runtime sends on every
 * MCP call of the turn and cannot refresh.
 *
 * Backstage's OAuth2 hands out its cached session's token until less than 3
 * minutes of it remain, and that stays what every other caller gets. This
 * refreshes the session when its token has less than `minLifetimeLeft` (a
 * share of the token's own lifetime, `exp` − `iat`) left, and keeps the token
 * it refreshed to for the next such request. OAuth2 keeps its cached session
 * as it was, since it takes no session from outside.
 */
export class LastingIdTokens {
  private readonly authApi: Options['authApi'];
  private readonly refresh: Options['refresh'];

  private lasting?: string;
  private refreshing?: Promise<string>;
  // Counts sign-outs: a refresh that was running across one belongs to the
  // signed-out session, and its token is neither kept nor shared.
  private generation = 0;

  constructor(options: Options) {
    this.authApi = options.authApi;
    this.refresh = options.refresh;
    // A kept token is the signed-out person's: it must not reach a request
    // made after a new sign-in.
    this.authApi.sessionState$().subscribe(state => {
      if (state === SessionState.SignedOut) {
        this.generation += 1;
        this.lasting = undefined;
        this.refreshing = undefined;
      }
    });
  }

  /**
   * An ID token with at least `minLifetimeLeft` of its lifetime left, or the
   * session's own when it cannot get one.
   *
   * The session's token is asked for first, with `request` as given: it
   * decides whether there is a session at all, and opens the sign-in where
   * `request` lets it, exactly as `getIdToken` does. Only then, and only when
   * its token falls short, is the session refreshed. When the refresh fails,
   * the session's token is the answer: it is still valid, and a refresh that
   * failed is no reason to stop a person's request.
   */
  async getIdToken(
    minLifetimeLeft: number,
    request?: AuthRequestOptions,
  ): Promise<string> {
    const token = await this.authApi.getIdToken(request);
    if (!token || this.lastsLongEnough(token, minLifetimeLeft)) {
      return token;
    }
    if (this.lasting && this.lastsLongEnough(this.lasting, minLifetimeLeft)) {
      return this.lasting;
    }

    const generation = this.generation;
    let refreshed: string;
    try {
      refreshed = await this.collapsedRefresh(minLifetimeLeft);
    } catch {
      return token;
    }
    if (!refreshed || generation !== this.generation) {
      return token;
    }
    // A refresh can come back no better, from a broker that hands out a token
    // it cached itself: the caller then gets the longer of the two.
    const lasting = laterExpiring(refreshed, token);
    // Kept only while its lifetime can be read: one that cannot would count
    // as lasting long enough forever, past its expiry.
    if (idTokenLifetimeLeft(lasting) !== undefined) {
      this.lasting = lasting;
    }
    return lasting;
  }

  private lastsLongEnough(token: string, minLifetimeLeft: number): boolean {
    return hasIdTokenLifetimeLeft(token, minLifetimeLeft);
  }

  /** One refresh at a time: requests made while it runs share its token. */
  private collapsedRefresh(minLifetimeLeft: number): Promise<string> {
    if (!this.refreshing) {
      const refreshing = this.refresh(minLifetimeLeft).finally(() => {
        if (this.refreshing === refreshing) {
          this.refreshing = undefined;
        }
      });
      this.refreshing = refreshing;
    }
    return this.refreshing;
  }
}
