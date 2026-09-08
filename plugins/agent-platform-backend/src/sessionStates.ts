import { LoggerService } from '@backstage/backend-plugin-api';
import {
  isListableSession,
  normalizeSessionList,
  normalizeTaskList,
  readNewestTaskState,
  SessionStateEntry,
  SessionStatesResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { KagentClient } from './KagentClient';
import {
  atLeast,
  MIN_READ_SLICE_MS,
  readTasksInPool,
  selectCandidates,
  TokenKeyedCache,
} from './sessionFanOut';

/**
 * How many of a user's sessions may be evaluated in one pass.
 *
 * A real account on an internal installation held 21 sessions whose task payloads
 * totalled 2.8 MB,
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

export type SessionStateOptions = {
  maxSessions?: number;
  maxAgeMs?: number;
  concurrency?: number;
  taskTimeoutMs?: number;
  budgetMs?: number;
  cacheTtlMs?: number;
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
 *
 * The bounding, pooling and caching are `./sessionFanOut`; what is here is the
 * reduction — one A2A state per session — and the numbers it is bounded by.
 */
export class SessionStateReader {
  private readonly cache: TokenKeyedCache<SessionStatesResponse>;
  private readonly maxSessions: number;
  private readonly maxAgeMs: number;
  private readonly concurrency: number;
  private readonly taskTimeoutMs: number;
  private readonly budgetMs: number;

  constructor(
    private readonly client: KagentClient,
    private readonly logger: LoggerService,
    private readonly installation: string,
    options: SessionStateOptions = {},
    private readonly now: () => number = Date.now,
  ) {
    // Floored, because `??` only substitutes for `undefined` — a configured `0`
    // reaches here intact and silently disables the route rather than being
    // rejected. `concurrency: 0` spawns no workers, so `Promise.all([])`
    // resolves at once and every candidate is reported as skipped; the same
    // shape applies to `maxSessions: 0` (no candidates) and a non-positive
    // `budgetMs` (deadline already expired). These are knobs meant to be turned
    // in an emergency, so a mistyped one must degrade loudly, not quietly.
    this.maxSessions = atLeast(1, options.maxSessions, DEFAULT_MAX_SESSIONS);
    this.maxAgeMs = atLeast(1, options.maxAgeMs, DEFAULT_MAX_AGE_MS);
    this.concurrency = atLeast(1, options.concurrency, DEFAULT_CONCURRENCY);
    // Floored to a slice that can actually complete a read rather than to 1 ms:
    // below `MIN_READ_SLICE_MS` a worker declines to dispatch at all, so a 1 ms
    // floor would satisfy the type and still evaluate nothing.
    this.taskTimeoutMs = atLeast(
      MIN_READ_SLICE_MS,
      options.taskTimeoutMs,
      DEFAULT_TASK_TIMEOUT_MS,
    );
    this.budgetMs = atLeast(
      MIN_READ_SLICE_MS,
      options.budgetMs,
      DEFAULT_BUDGET_MS,
    );
    // A zero TTL is meaningful here — it means "do not cache" — so only
    // negatives are floored.
    this.cache = new TokenKeyedCache<SessionStatesResponse>(
      atLeast(0, options.cacheTtlMs, DEFAULT_CACHE_TTL_MS),
      this.now,
    );
  }

  /** Summarise the caller's sessions. */
  async read(userToken: string): Promise<SessionStatesResponse> {
    return this.cache.read(userToken, () => this.compute(userToken));
  }

  private async compute(userToken: string): Promise<SessionStatesResponse> {
    const raw = await this.client.listSessions({ userToken });
    const { sessions } = normalizeSessionList(raw, this.installation);

    const listable = sessions.filter(isListableSession);
    const { candidates, pastCap } = selectCandidates(listable, {
      now: this.now(),
      maxAgeMs: this.maxAgeMs,
      maxSessions: this.maxSessions,
    });
    const states: SessionStateEntry[] = [];

    const { unreadable, skipped, failures } = await readTasksInPool({
      candidates,
      bounds: {
        concurrency: this.concurrency,
        taskTimeoutMs: this.taskTimeoutMs,
        budgetMs: this.budgetMs,
      },
      now: this.now,
      read: (sessionId, timeoutMs) =>
        this.client.listSessionTasks(sessionId, { userToken }, { timeoutMs }),
      onPayload: (session, payload) => {
        const { tasks } = normalizeTaskList(payload);
        const newest = readNewestTaskState(tasks);
        states.push({
          sessionId: session.sessionId,
          state: newest?.state.raw ?? null,
          ...(newest?.changedAt === undefined
            ? {}
            : { changedAt: newest.changedAt }),
        });
      },
    });

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

    return {
      evaluatedAt: this.now(),
      states,
      unreadable,
      // The cap and the budget cutoff, and deliberately *not*
      // `listable.length - candidates.length`: that would fold the routine
      // `maxAgeMs` window exclusion in with genuine shortfalls, and a single
      // session older than the window — the normal state of an account after a
      // week — would make `skipped` permanently non-zero. The UI reads this as
      // "we could not tell", so conflating them replaces an over-claim with a
      // permanent under-claim and a retry that can never change it.
      skipped: pastCap + skipped,
    };
  }
}
