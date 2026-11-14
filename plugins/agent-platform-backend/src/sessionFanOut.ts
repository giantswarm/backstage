import { createHash } from 'crypto';
import {
  selectCandidates,
  type SessionCandidate,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Shared machinery for the routes that answer a question about *every* one of a
 * user's sessions.
 *
 * kagent stores no summary of a session — not its state, not its token usage — so
 * the only way to learn one is to read each session's whole conversation. On real
 * data that is megabytes of task payloads to answer with a few hundred bytes,
 * which is why it happens on this side of the wire. Every route that does it
 * needs the same three things: a bound on which sessions are worth reading, a
 * pool that reads them without holding them all in memory, and a cache keyed so
 * one user's answer can never be served to another.
 *
 * Those three live here so a second such route cannot drift from the first. What
 * stays with each route is the part that differs: its bounds, and what it reduces
 * a payload to.
 */

/**
 * Cache entries retained per installation.
 *
 * One entry per distinct token, so an instance that has served many users over a
 * long uptime would otherwise accumulate one each. Expired entries are purged on
 * access; this is the backstop.
 */
export const CACHE_MAX_ENTRIES = 200;

/**
 * The least time a task read is worth starting with.
 *
 * Without a floor a worker could dispatch with 1 ms of budget left, get
 * `timeoutMs: 1`, and all but certainly time out — landing in `unreadable`
 * ("we asked and failed") when the truth is that the pass ran out of time,
 * which belongs in `skipped`. The two are worded differently to the operator,
 * so the mis-attribution would put a fault in front of them for a budget
 * cutoff.
 */
export const MIN_READ_SLICE_MS = 250;

/**
 * A configured number, floored — or the default when nothing is configured.
 *
 * Absent means "use the default"; present but out of range means someone typed
 * a value that would disable the route, and the nearest working one is a better
 * answer than silence.
 */
export function atLeast(
  floor: number,
  configured: number | undefined,
  fallback: number,
): number {
  if (configured === undefined) {
    return fallback;
  }
  return Math.max(floor, configured);
}

/** A session the passes consider: `SessionCandidate` in agent-platform-common. */
export type Candidate = SessionCandidate;

// Shared with the fixture mode, which selects the same sessions.
export { selectCandidates };

export type FanOutBounds = {
  concurrency: number;
  taskTimeoutMs: number;
  budgetMs: number;
};

export type FanOutResult = {
  /**
   * Sessions whose task read failed. Genuinely unknown — which is not the same
   * as terminal, and not the same as never evaluated.
   */
  unreadable: string[];
  /** Candidates the pass never reached, because the budget ran out. */
  skipped: number;
  /** Same length as `unreadable`; separate so callers can log a count. */
  failures: number;
};

/**
 * Read each candidate's tasks through a sliding pool, inside one budget.
 *
 * `onPayload` is called from the worker and is deliberately synchronous: the
 * payload (up to 481 KB measured) is reduced and dropped before that worker
 * starts its next read, so nothing large is resident beyond `concurrency` at a
 * time. Callers accumulate whatever they need; this owns only the pool, the
 * deadline and the accounting.
 *
 * Candidates are handed to `onPayload` in *completion* order, not candidate
 * order — a slow read does not hold up the ones behind it, which is the point of
 * a sliding pool.
 */
export async function readTasksInPool<T extends Candidate>(input: {
  candidates: readonly T[];
  bounds: FanOutBounds;
  now: () => number;
  read: (sessionId: string, timeoutMs: number) => Promise<unknown>;
  onPayload: (session: T, payload: unknown) => void;
}): Promise<FanOutResult> {
  const { candidates, bounds, now, read, onPayload } = input;

  const deadline = now() + bounds.budgetMs;
  const unreadable: string[] = [];
  let failures = 0;

  const queue = [...candidates];
  const worker = async (): Promise<void> => {
    for (;;) {
      const session = queue.shift();
      if (!session) {
        return;
      }
      const remaining = deadline - now();
      if (remaining < MIN_READ_SLICE_MS) {
        // Everything still queued is unevaluated, including this one. Put it
        // back so the count is taken in one place below.
        queue.unshift(session);
        return;
      }
      try {
        const payload = await read(
          session.sessionId,
          // Clamped to what is left of the pass, not the flat per-read
          // timeout. Checking the deadline only before dispatching would
          // bound *dispatch* time: a worker starting a read at
          // `budgetMs - 1ms` would still wait the full `taskTimeoutMs`, so
          // the route could hold a request for `budgetMs + taskTimeoutMs`
          // (13 s on the states defaults) — past the frontend's 10 s poll,
          // which is the pile-up `budgetMs` exists to prevent.
          Math.min(bounds.taskTimeoutMs, remaining),
        );
        onPayload(session, payload);
      } catch {
        // Individually caught, always. A session deleted between the list and
        // the read, or one installation hiccup, must cost that row and not the
        // whole pass.
        failures += 1;
        unreadable.push(session.sessionId);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(bounds.concurrency, queue.length) }, worker),
  );

  return { unreadable, skipped: queue.length, failures };
}

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

/**
 * A promise cache keyed by a hash of the caller's token.
 *
 * Keyed on the token rather than on the Backstage identity: kagent scopes its
 * session list by the `sub` of *this* token, so the token is exactly the scoping
 * key. It also means a rotated token, or a sign-out, cannot read a previous
 * holder's summary — the entry simply stops being addressable.
 *
 * **Not `cacheService`.** That is a pluggable store, and the day it points at
 * Redis this becomes per-user chat-derived data in a shared external store that
 * outlives both the process and sign-out. An in-process cache is the exact
 * lifetime wanted and cannot leak past a restart.
 */
export class TokenKeyedCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries: number = CACHE_MAX_ENTRIES,
  ) {}

  read(userToken: string, compute: () => Promise<T>): Promise<T> {
    const key = createHash('sha256').update(userToken).digest('hex');
    const now = this.now();

    for (const [candidate, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(candidate);
      }
    }

    const cached = this.cache.get(key);
    if (cached) {
      return cached.value;
    }

    // The promise goes in before it resolves, so two polls landing together —
    // two browser tabs, or a re-render racing itself — share one fan-out rather
    // than doubling it.
    // Declared before the promise so the rejection handler can recognise its
    // own entry. An unconditional `delete(key)` would let a slow failing pass
    // evict a *newer, healthy* one: a pass can outlive `ttlMs` when kagent
    // is degraded, by which time its entry has been purged and a later request
    // has installed and resolved a fresh one under the same key. Deleting then
    // throws away a valid in-TTL summary and every subsequent poll starts
    // another fan-out.
    const entry: CacheEntry<T> = {
      expiresAt: now + this.ttlMs,
      value: compute().catch(error => {
        // A failed pass must not be cached: the next request should retry rather
        // than be handed the same rejection for the whole TTL.
        if (this.cache.get(key) === entry) {
          this.cache.delete(key);
        }
        throw error;
      }),
    };
    const value = entry.value;
    this.cache.set(key, entry);

    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next();
      if (oldest.done) {
        break;
      }
      this.cache.delete(oldest.value);
    }

    return value;
  }
}
