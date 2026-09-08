import { LoggerService } from '@backstage/backend-plugin-api';
import {
  isListableSession,
  KagentSession,
  normalizeSessionList,
  normalizeTaskList,
  reduceSessionUsage,
  SessionUsageResponse,
  UsageAgentEntry,
  UsageDayEntry,
  UsageServerEntry,
  UsageTally,
  UsageToolEntry,
  USAGE_TOP_N,
  utcDayKey,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { KagentClient } from './KagentClient';
import {
  atLeast,
  MIN_READ_SLICE_MS,
  readTasksInPool,
  selectCandidates,
  TokenKeyedCache,
} from './sessionFanOut';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window the page reports on. */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * How many of a user's sessions may be evaluated in one pass.
 *
 * Three times a measured real account (21 sessions, 2.8 MB of task payloads).
 * Unlike the session-states pass, the window here *is* the reported scope, so
 * this cap is the only thing that can make the page under-report — which is why
 * it is generous and why exceeding it is surfaced as `skipped` rather than
 * hidden.
 */
export const DEFAULT_MAX_SESSIONS = 60;

/**
 * How stale a session may be and still be worth a task read.
 *
 * The window plus a day of slack for clock skew and the UTC day boundary. Safe
 * because kagent bumps `session.updated_at` on every task write — `UpsertTask`
 * carries a `touched_session` CTE that does exactly that — so a session with no
 * activity in 31 days can hold no turn inside a 30-day window.
 */
export const DEFAULT_MAX_AGE_MS = (DEFAULT_WINDOW_DAYS + 1) * DAY_MS;

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

function emptyTally(): UsageTally {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
  };
}

function addInto(target: UsageTally, source: UsageTally): void {
  target.turns += source.turns;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.totalTokens += source.totalTokens;
  target.toolCalls += source.toolCalls;
}

/** Descending by count, then by name, so the answer is not Map order. */
function topBy<T>(
  counts: Map<string | null, number>,
  make: (key: string | null, calls: number) => T,
  limit = USAGE_TOP_N,
): T[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] ?? '').localeCompare(b[0] ?? ''))
    .slice(0, limit)
    .map(([key, calls]) => make(key, calls));
}

/**
 * The caller's usage on one installation, over a fixed window.
 *
 * The second route that *interprets* kagent rather than forwarding it, and it
 * earns the exception the same way the session-states one does: kagent stores
 * no usage summary of any kind, so the only way to total a user's tokens is to
 * read every session's whole conversation. That is megabytes to answer with a
 * couple of kilobytes, which belongs on this side of the wire.
 *
 * **This can only ever be personal.** kagent's `GET /api/sessions` is
 * `WHERE user_id = <sub>` with no pagination, no date filter and no cross-user
 * endpoint, so no fleet or team view grows out of this route — that needs a
 * different data source entirely, and the page's copy must not imply otherwise.
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
    this.maxAgeMs = atLeast(1, options.maxAgeMs, DEFAULT_MAX_AGE_MS);
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

    const totals = emptyTally();
    let sessionsWithActivity = 0;
    let undatedTurns = 0;
    let unparseableMessages = 0;
    const days = new Map<string, UsageTally>();
    const tools = new Map<string | null, number>();
    const servers = new Map<string | null, number>();
    const agents = new Map<string | null, UsageTally & { sessions: number }>();

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
          const usage = reduceSessionUsage(tasks, { startMs, endMs });

          // A session only counts toward `sessions` if it had a turn *inside* the
          // window. Otherwise a 30-day count would include conversations that saw
          // no activity in those 30 days, and the tile would disagree with the
          // chart beside it.
          if (usage.tally.turns === 0) {
            return;
          }
          sessionsWithActivity += 1;

          addInto(totals, usage.tally);
          undatedTurns += usage.undatedTurns;
          unparseableMessages += usage.unparseableMessages;

          for (const [day, tally] of usage.days) {
            const existing = days.get(day) ?? emptyTally();
            addInto(existing, tally);
            days.set(day, existing);
          }
          for (const [tool, calls] of usage.tools) {
            tools.set(tool, (tools.get(tool) ?? 0) + calls);
          }
          for (const [server, calls] of usage.servers) {
            servers.set(server, (servers.get(server) ?? 0) + calls);
          }

          // Attributed to the *delegating* agent, deliberately: a child's own
          // agentId is not knowable from the response, its session is excluded
          // from the pass, and "this agent's work cost this much" is the reading
          // that is useful.
          const agentId = session.agentId ?? null;
          const agent =
            agents.get(agentId) ?? Object.assign(emptyTally(), { sessions: 0 });
          addInto(agent, usage.tally);
          agent.sessions += 1;
          agents.set(agentId, agent);
        },
      });

    if (failures > 0 || unparseableMessages > 0) {
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
          unparseableMessages,
        },
      );
    }

    return {
      evaluatedAt: endMs,
      windowStart: startMs,
      windowDays: this.windowDays,
      totals: { ...totals, sessions: sessionsWithActivity },
      daily: this.denseDaily(days, startMs, endMs),
      byAgent: this.rankAgents(agents),
      topTools: topBy<UsageToolEntry>(tools, (tool, calls) => ({
        tool: tool ?? 'unknown tool',
        calls,
      })),
      topMcpServers: topBy<UsageServerEntry>(servers, (server, calls) => ({
        server,
        calls,
      })),
      undatedTurns,
      unreadable,
      // The cap and the budget cutoff. Deliberately not the activity-window
      // exclusion: that is a scope decision, and folding it in would make this
      // permanently non-zero for any account holding an older session, which
      // the UI reads as "we could not tell".
      skipped: pastCap + skipped,
    };
  }

  /**
   * Every UTC day in the window, zero-filled.
   *
   * The backend owns this because it owns the window. A sparse series would
   * leave a bar chart to reconstruct the missing days, and a chart that simply
   * omits them silently compresses the timeline — 30 bars that do not mean 30
   * days.
   */
  private denseDaily(
    days: Map<string, UsageTally>,
    startMs: number,
    endMs: number,
  ): UsageDayEntry[] {
    const daily: UsageDayEntry[] = [];
    // Walked from the window's first UTC day to its last, by key rather than by
    // adding 24 h to a timestamp, so the sequence cannot drift.
    for (let at = startMs; at <= endMs; at += DAY_MS) {
      const day = utcDayKey(at);
      if (daily.length > 0 && daily[daily.length - 1].day === day) {
        continue;
      }
      const tally = days.get(day);
      daily.push({
        day,
        inputTokens: tally?.inputTokens ?? 0,
        outputTokens: tally?.outputTokens ?? 0,
        turns: tally?.turns ?? 0,
      });
    }
    return daily;
  }

  private rankAgents(
    agents: Map<string | null, UsageTally & { sessions: number }>,
  ): UsageAgentEntry[] {
    return [...agents.entries()]
      .map(([agentId, tally]) => ({
        agentId,
        sessions: tally.sessions,
        turns: tally.turns,
        inputTokens: tally.inputTokens,
        outputTokens: tally.outputTokens,
      }))
      .sort(
        (a, b) =>
          b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) ||
          (a.agentId ?? '').localeCompare(b.agentId ?? ''),
      );
  }
}
