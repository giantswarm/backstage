import { LoggerService } from '@backstage/backend-plugin-api';
import { createHash } from 'crypto';
import {
  isListableSession,
  normalizeSessionList,
  normalizeTaskList,
  readNewestTaskState,
  SessionStateEntry,
  SessionStatesResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { KagentClient } from './KagentClient';

/**
 * How many of a user's sessions may be evaluated in one pass.
 *
 * A real account on gazelle held 21 sessions whose task payloads totalled 2.8 MB,
 * so 20 covers a whole history today. It is here for the account that is ten
 * times that: the reads are the expensive part and their cost is unbounded in the
 * session count alone.
 */
export const DEFAULT_MAX_SESSIONS = 20;

/**
 * How stale a session may be and still be worth a task read.
 *
 * Deliberately generous. A session in `input-required` is blocked on a human and
 * can sit for days — that is precisely what the rail's WAITING group exists to
 * surface, so a tight window would delete the feature's main use case rather than
 * trim its cost.
 */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Task reads in flight at once.
 *
 * A sliding pool rather than batches: payloads ranged 1.6 KB to 481 KB on real
 * data, so a batch would run at the pace of its largest member while three
 * connections idled. Four bounds resident JSON at roughly 2 MB.
 */
export const DEFAULT_CONCURRENCY = 4;

/**
 * Per-read timeout, below the client's own default.
 *
 * Measured reads took 44–118 ms. Five seconds is far outside that, and exists so
 * one hung connection cannot consume the whole pass.
 */
export const DEFAULT_TASK_TIMEOUT_MS = 5_000;

/**
 * Whole-pass deadline.
 *
 * Under the frontend's 10 s active poll on purpose: an answer slower than the
 * interval that asks for it would let requests pile up. A complete pass measured
 * ~500 ms, so this only ever engages when something is wrong.
 */
export const DEFAULT_BUDGET_MS = 8_000;

/**
 * How long a computed summary is reused.
 *
 * Must exceed the frontend's fast poll (10 s) or it would miss on nearly every
 * request and buy nothing. At 15 s the fan-out runs at most four times a minute
 * per user per installation, while the rail is never more than 15 s behind — an
 * order of magnitude inside the five minutes the state semantics already tolerate
 * before they stop calling a session live.
 */
export const DEFAULT_CACHE_TTL_MS = 15_000;

/**
 * Cache entries retained per installation.
 *
 * One entry per distinct token, so an instance that has served many users over a
 * long uptime would otherwise accumulate one each. Expired entries are purged on
 * access; this is the backstop.
 */
export const CACHE_MAX_ENTRIES = 200;

export type SessionStateOptions = {
  maxSessions?: number;
  maxAgeMs?: number;
  concurrency?: number;
  taskTimeoutMs?: number;
  budgetMs?: number;
  cacheTtlMs?: number;
};

type CacheEntry = {
  expiresAt: number;
  value: Promise<SessionStatesResponse>;
};

/**
 * Derived session-state summaries for one installation.
 *
 * This is the one place in the proxy that *interprets* kagent rather than
 * forwarding it, and the exception is deliberate: the rail needs one state string
 * per session, and the only way to learn it is to read each session's whole
 * conversation. On real data that is 2.8 MB to answer with about 700 bytes, which
 * belongs on this side of the wire. It stays honest by deriving through the very
 * same parser and state map the UI renders from, shared from
 * `agent-platform-common` so the two cannot disagree.
 */
export class SessionStateReader {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSessions: number;
  private readonly maxAgeMs: number;
  private readonly concurrency: number;
  private readonly taskTimeoutMs: number;
  private readonly budgetMs: number;
  private readonly cacheTtlMs: number;

  constructor(
    private readonly client: KagentClient,
    private readonly logger: LoggerService,
    private readonly installation: string,
    options: SessionStateOptions = {},
    private readonly now: () => number = Date.now,
  ) {
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /**
   * Summarise the caller's sessions.
   *
   * Keyed on a hash of the token rather than on the Backstage identity: kagent
   * scopes its list by the `sub` of *this* token, so the token is exactly the
   * scoping key. It also means a rotated token, or a sign-out, cannot read a
   * previous holder's summary — the entry simply stops being addressable.
   */
  async read(userToken: string): Promise<SessionStatesResponse> {
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
    const value = this.compute(userToken).catch(error => {
      // A failed pass must not be cached: the next request should retry rather
      // than be handed the same rejection for the whole TTL.
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, { expiresAt: now + this.cacheTtlMs, value });

    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (oldest.done) {
        break;
      }
      this.cache.delete(oldest.value);
    }

    return value;
  }

  private async compute(userToken: string): Promise<SessionStatesResponse> {
    const raw = await this.client.listSessions({ userToken });
    const { sessions } = normalizeSessionList(raw, this.installation);

    const listable = sessions.filter(isListableSession);
    const candidates = selectCandidates(listable, {
      now: this.now(),
      maxAgeMs: this.maxAgeMs,
      maxSessions: this.maxSessions,
    });
    let skipped = listable.length - candidates.length;

    const deadline = this.now() + this.budgetMs;
    const states: SessionStateEntry[] = [];
    const unreadable: string[] = [];
    let failures = 0;

    const queue = [...candidates];
    const worker = async (): Promise<void> => {
      for (;;) {
        const session = queue.shift();
        if (!session) {
          return;
        }
        if (this.now() >= deadline) {
          // Everything still queued is unevaluated, including this one. Put it
          // back so the count is taken in one place below.
          queue.unshift(session);
          return;
        }
        try {
          const payload = await this.client.listSessionTasks(
            session.sessionId,
            { userToken },
            { timeoutMs: this.taskTimeoutMs },
          );
          const { tasks } = normalizeTaskList(payload);
          const newest = readNewestTaskState(tasks);
          states.push({
            sessionId: session.sessionId,
            state: newest?.state.raw ?? null,
            ...(newest?.changedAt === undefined
              ? {}
              : { changedAt: newest.changedAt }),
          });
        } catch {
          // Individually caught, always. A session deleted between the list and
          // the read, or one installation hiccup, must cost that row and not the
          // whole rail.
          failures += 1;
          unreadable.push(session.sessionId);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, queue.length) }, worker),
    );
    skipped += queue.length;

    if (failures > 0) {
      // `debug`, and a count rather than ids: the root logger forwards warn and
      // error to Sentry, and a partial read is the expected outcome this route is
      // built around, not a fault anyone should be paged about. The installation
      // travels as structured metadata so it cannot fingerprint into one issue
      // per installation.
      this.logger.debug(
        'Some kagent task reads failed while summarising session states',
        { failed: failures, evaluated: candidates.length },
      );
    }

    return { evaluatedAt: this.now(), states, unreadable, skipped };
  }
}

type Candidate = { sessionId: string; updatedAt?: string };

/**
 * Which sessions are worth a task read, newest activity first.
 *
 * Bounding happens here, before a single byte of conversation is fetched — the
 * cap is the real protection, and the window only trims a long tail that a busy
 * account would have hit the cap on anyway.
 *
 * A session with no usable `updated_at` is **kept**. `normalizeTimestamp` already
 * rejects Go zero time and anything unparseable, so an absent value means "we
 * cannot tell", and dropping those would silently hide a session on the strength
 * of a field kagent need not populate. They sort last, where the cap can still
 * reach them.
 */
export function selectCandidates(
  sessions: Candidate[],
  opts: { now: number; maxAgeMs: number; maxSessions: number },
): Candidate[] {
  const withTime = sessions.map(session => ({
    session,
    at: session.updatedAt ? Date.parse(session.updatedAt) : undefined,
  }));

  const inWindow = withTime.filter(
    ({ at }) => at === undefined || opts.now - at <= opts.maxAgeMs,
  );

  inWindow.sort((a, b) => {
    if (a.at === undefined && b.at === undefined) return 0;
    if (a.at === undefined) return 1;
    if (b.at === undefined) return -1;
    return b.at - a.at;
  });

  return inWindow.slice(0, opts.maxSessions).map(({ session }) => session);
}
