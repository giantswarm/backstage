import { LoggerService } from '@backstage/backend-plugin-api';
import {
  isListableSession,
  KagentSession,
  normalizeSessionList,
  normalizeTaskList,
  selectCandidates,
  SessionUsageResponse,
  SessionUsageRollup,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { KagentClient } from './KagentClient';
import {
  atLeast,
  MIN_READ_SLICE_MS,
  readTasksInPool,
  TokenKeyedCache,
} from './sessionFanOut';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window the page reports on. */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * How many of a user's sessions may be evaluated in one pass.
 *
 * Three times a measured real account (21 sessions) over the default 30-day
 * window. It does not scale with `windowDays`: a wider window holds more
 * sessions, so raise this with it, within what `budgetMs` can read.
 * Unlike the session-states pass, the window here *is* the reported scope, so
 * this cap is the only thing that can make the page under-report — which is why
 * it is generous and why exceeding it is surfaced as `skipped` rather than
 * hidden.
 */
export const DEFAULT_MAX_SESSIONS = 60;

/**
 * How stale a session may be and still be worth a task read, for a window.
 *
 * The window plus a day of slack for clock skew and the UTC day boundary. Safe
 * because the controller bumps an instance's `updated_at` on every turn, so an
 * instance with no activity in 31 days can hold no turn inside a 30-day window.
 *
 * Derived from the configured window rather than fixed: a fixed 31 days would
 * silently drop every session idle for longer once `windowDays` is raised.
 */
export function defaultMaxAgeMs(windowDays: number): number {
  return (windowDays + 1) * DAY_MS;
}

/**
 * Task reads in flight at once.
 *
 * Higher than the session-states pass: nothing polls this route, and it has
 * three times the sessions to cover. Still a sliding pool rather than batches,
 * because payloads span 1.6 KB to 481 KB.
 */
export const DEFAULT_CONCURRENCY = 6;

/** Per-read timeout, below the client's own default. */
export const DEFAULT_TASK_TIMEOUT_MS = 5_000;

/**
 * Whole-pass deadline.
 *
 * Larger than the session-states budget on purpose. That one exists to stay
 * under the frontend's 10 s poll; nothing polls this. The ceiling that matters
 * here is the request timeout of whatever fronts Backstage (often 30 s): under
 * it, the browser gets our 200 with `skipped` set rather than a 504 carrying
 * nothing. A 60-session pass measures a few seconds, so this only engages when
 * kagent is degraded.
 */
export const DEFAULT_BUDGET_MS = 20_000;

/**
 * How long a computed summary is reused.
 *
 * Much longer than the session-states TTL, and for the opposite reason: that
 * one is pinned by a 10 s poll it has to beat, while this route is read on a
 * tab visit and its buckets are *days*. Five minutes covers the real access
 * pattern — a tab bounce, a reload, a second browser tab — with one fan-out,
 * and `evaluatedAt` travels in the response so the staleness is shown rather
 * than hidden.
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60_000;

export type SessionUsageOptions = {
  windowDays?: number;
  maxSessions?: number;
  maxAgeMs?: number;
  concurrency?: number;
  taskTimeoutMs?: number;
  budgetMs?: number;
  cacheTtlMs?: number;
};

/**
 * The caller's usage on one installation, over a fixed window.
 *
 * The second route that *interprets* kagent rather than forwarding it, and it
 * earns the exception the same way the session-states one does: kagent stores
 * no usage summary of any kind, so the only way to total a user's tokens is to
 * read every session's whole conversation. That is megabytes to answer with a
 * couple of kilobytes, which belongs on this side of the wire.
 *
 * **This can only ever be personal.** `ListSessions` answers for the
 * caller the gateway identified and nothing else (the cross-creator flag needs
 * an authorization this plugin does not ask for), so no fleet or team view grows
 * out of this route — that needs a different data source entirely, and the
 * page's copy must not imply otherwise.
 *
 * Bounding, pooling and caching are `./sessionFanOut`, shared with the
 * session-states reader; the arithmetic is `reduceSessionUsage`, shared with
 * the timeline the session detail page renders. What is here is the rollup and
 * the numbers it is bounded by.
 */
export class SessionUsageReader {
  private readonly cache: TokenKeyedCache<SessionUsageResponse>;
  private readonly windowDays: number;
  private readonly maxSessions: number;
  private readonly maxAgeMs: number;
  private readonly concurrency: number;
  private readonly taskTimeoutMs: number;
  private readonly budgetMs: number;

  constructor(
    private readonly client: KagentClient,
    private readonly logger: LoggerService,
    private readonly installation: string,
    options: SessionUsageOptions = {},
    private readonly now: () => number = Date.now,
  ) {
    // Floored rather than `??`-defaulted, for the reason the session-states
    // reader documents: `??` only substitutes for `undefined`, so a configured
    // `0` would reach through and silently disable the route.
    this.windowDays = atLeast(1, options.windowDays, DEFAULT_WINDOW_DAYS);
    this.maxSessions = atLeast(1, options.maxSessions, DEFAULT_MAX_SESSIONS);
    this.maxAgeMs = atLeast(
      1,
      options.maxAgeMs,
      defaultMaxAgeMs(this.windowDays),
    );
    this.concurrency = atLeast(1, options.concurrency, DEFAULT_CONCURRENCY);
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
    this.cache = new TokenKeyedCache<SessionUsageResponse>(
      atLeast(0, options.cacheTtlMs, DEFAULT_CACHE_TTL_MS),
      this.now,
    );
  }

  /** Summarise the caller's usage. */
  async read(userToken: string): Promise<SessionUsageResponse> {
    return this.cache.read(userToken, () => this.compute(userToken));
  }

  private async compute(userToken: string): Promise<SessionUsageResponse> {
    const endMs = this.now();
    const startMs = endMs - this.windowDays * DAY_MS;

    const raw = await this.client.listSessions({ userToken });
    const { sessions } = normalizeSessionList(raw, this.installation);

    // Subagent sessions are excluded here as everywhere: a delegated agent's
    // cost is already counted through the parent's tool response, so reading
    // its own session would count it twice.
    const listable = sessions.filter(isListableSession);
    const { candidates, pastCap } = selectCandidates(listable, {
      now: endMs,
      maxAgeMs: this.maxAgeMs,
      maxSessions: this.maxSessions,
    });

    const rollup = new SessionUsageRollup({ startMs, endMs });

    const { unreadable, skipped, failures } =
      await readTasksInPool<KagentSession>({
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
          rollup.add(session, tasks);
        },
      });

    if (failures > 0 || rollup.unparseableMessages > 0) {
      // `debug`, and counts rather than ids: the root logger forwards warn and
      // error to Sentry, and a partial read is the expected outcome this route
      // is built around. The installation travels as structured metadata so it
      // cannot fingerprint into one issue per installation.
      this.logger.debug(
        'Some kagent reads were incomplete while summarising session usage',
        {
          installation: this.installation,
          failed: failures,
          evaluated: candidates.length,
          unparseableMessages: rollup.unparseableMessages,
        },
      );
    }

    return rollup.result({
      windowDays: this.windowDays,
      unreadable,
      // The cap and the budget cutoff. Deliberately not the activity-window
      // exclusion: that is a scope decision, and folding it in would make this
      // permanently non-zero for any account holding an older session, which
      // the UI reads as "we could not tell".
      skipped: pastCap + skipped,
    });
  }
}
