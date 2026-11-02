/**
 * The requests that change an auth provider's session cookie, one at a time.
 *
 * Every `/refresh` rotates the provider's refresh cookie, so two sent at once
 * carry the same cookie and the backend refuses one of them ("Missing session
 * cookie"), which ends the session. The cookie is shared by every tab of the
 * portal, so the requests are serialised through the Web Locks API where the
 * browser has it (across tabs and within this one), else within this tab.
 *
 * A refresh joins one already pending whose scopes cover its own: the session
 * manager's refresh and a lasting-token refresh (`LastingIdTokens`) of the
 * same provider rotate the cookie once, not twice. A sign-out or a new
 * sign-in ends the session pending refreshes were for: none of them is joined
 * afterwards, and one still waiting for its turn is not sent.
 */

/** The share of the Web Locks API the queue uses. */
export type CookieLocks = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type PendingRefresh = {
  /** The scopes asked for; undefined when the backend's defaults were. */
  scopes?: ReadonlySet<string>;
  answer: Promise<unknown>;
};

const LOCK_PREFIX = 'backstage-auth-cookie:';

/** A refresh that was waiting for its turn when its session ended. */
export class AuthRefreshAbandonedError extends Error {
  constructor(provider: string) {
    super(
      `Auth refresh for ${provider} not sent: the session it was for ended`,
    );
    this.name = 'AuthRefreshAbandonedError';
  }
}

function covers(
  pending: ReadonlySet<string> | undefined,
  wanted: ReadonlySet<string> | undefined,
): boolean {
  if (pending === undefined || wanted === undefined) {
    return pending === wanted;
  }
  return [...wanted].every(scope => pending.has(scope));
}

export class ProviderCookieQueue {
  private readonly locks?: CookieLocks;
  private readonly pending = new Map<string, PendingRefresh[]>();
  private readonly generations = new Map<string, number>();
  /** Without Web Locks: the last request of each provider in this tab. */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(locks: CookieLocks | undefined = browserLocks()) {
    this.locks = locks;
  }

  /**
   * `send`'s answer for a refresh of `scopes`: a pending refresh's whose
   * scopes cover these, else `send` at the provider's next turn.
   */
  refresh<T>(
    provider: string,
    scopes: ReadonlySet<string> | undefined,
    send: () => Promise<T>,
  ): Promise<T> {
    const pending = this.pending.get(provider) ?? [];
    const joined = pending.find(entry => covers(entry.scopes, scopes));
    if (joined) {
      return joined.answer as Promise<T>;
    }
    const generation = this.generation(provider);
    const answer = this.inTurn(provider, async () => {
      if (generation !== this.generation(provider)) {
        throw new AuthRefreshAbandonedError(provider);
      }
      return send();
    });
    const entry: PendingRefresh = { scopes, answer };
    this.pending.set(provider, [...pending, entry]);
    const settled = () => {
      const left = (this.pending.get(provider) ?? []).filter(e => e !== entry);
      if (left.length > 0) {
        this.pending.set(provider, left);
      } else {
        this.pending.delete(provider);
      }
    };
    answer.then(settled, settled);
    return answer;
  }

  /**
   * `send` at the provider's next turn, for a request that ends the session
   * (`/logout`): the pending refreshes are dropped first.
   */
  endSession<T>(provider: string, send: () => Promise<T>): Promise<T> {
    this.sessionChanged(provider);
    return this.inTurn(provider, send);
  }

  /**
   * A new session began (a completed sign-in): the pending refreshes were for
   * the one before it.
   */
  sessionChanged(provider: string): void {
    this.generations.set(provider, this.generation(provider) + 1);
    this.pending.delete(provider);
  }

  private generation(provider: string): number {
    return this.generations.get(provider) ?? 0;
  }

  private inTurn<T>(provider: string, task: () => Promise<T>): Promise<T> {
    if (this.locks) {
      return this.locks.request(`${LOCK_PREFIX}${provider}`, task);
    }
    const previous = this.tails.get(provider) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.tails.set(provider, next);
    const settled = () => {
      if (this.tails.get(provider) === next) {
        this.tails.delete(provider);
      }
    };
    next.then(settled, settled);
    return next;
  }
}

function browserLocks(): CookieLocks | undefined {
  const locks =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as { locks?: CookieLocks }).locks;
  return locks ? locks : undefined;
}

/** The page's queue, shared by every connector of every provider. */
export const providerCookieQueue = new ProviderCookieQueue();
