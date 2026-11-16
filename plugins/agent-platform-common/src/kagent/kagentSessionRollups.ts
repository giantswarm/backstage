import {
  readInstanceFailureReason,
  readTaskFailureReason,
} from './kagentFailureReason';
import { isRuntimeLostReason } from './kagentRuntimeLost';
import {
  USAGE_TOP_N,
  type SessionUsageResponse,
  type UsageAgentEntry,
  type UsageDayEntry,
  type UsageRemainder,
  type UsageServerEntry,
  type UsageToolEntry,
} from './kagentSessionUsage';
import { readNewestTaskState } from './kagentSessionState';
import type { SessionStateEntry } from './kagentSessionStates';
import type { KagentSession } from './kagentSessions';
import type { A2aTaskWire } from './kagentTaskSchema';
import {
  addTally,
  emptyTally,
  reduceSessionUsage,
  utcDayKey,
  type UsageTally,
} from './kagentUsage';

/**
 * The pure halves of the backend's session states and usage summaries
 * (`SessionStateReader`, `SessionUsageReader` in agent-platform-backend):
 * which sessions are read, and what their tasks add up to. Shared so the
 * fixture mode computes them with the same code (docs/fixtures.md).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionCandidate = { sessionId: string; updatedAt?: string };

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
 *
 * Generic in the session type so a caller's own fields survive selection: the
 * usage pass needs each candidate's `agentId` after the read, and re-joining it
 * against the list afterwards would be a second chance to get the pairing wrong.
 */
export function selectCandidates<T extends SessionCandidate>(
  sessions: readonly T[],
  opts: { now: number; maxAgeMs: number; maxSessions: number },
): { candidates: T[]; pastCap: number } {
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

  return {
    candidates: inWindow
      .slice(0, opts.maxSessions)
      .map(({ session }) => session),
    // Only the cap is a shortfall. Sessions outside the window are out of scope
    // by policy — the same kind of decision as excluding subagent sessions — and
    // counting them as "not checked" would be permanent on any account more than
    // a week old, which makes the UI's "cannot tell" state unreachable-to-escape
    // rather than informative.
    pastCap: Math.max(0, inWindow.length - opts.maxSessions),
  };
}

/**
 * The instance states that *are* the session's state, with no turn to consult.
 * A ready or suspended instance says nothing about its newest turn (a suspended
 * actor may be waiting on a human or simply idle after a finished turn), so
 * those still read their tasks.
 */
const INSTANCE_DECIDED_STATES = new Set(['failed', 'creating', 'deleting']);

/**
 * The state entry an instance's own lifecycle state decides, or undefined when
 * its tasks have to be read. The instance's `updatedAt` is the age basis, as it
 * moves with every lifecycle change. A failed instance carries its failure's
 * class, never its message.
 */
export function instanceDecidedState(
  session: KagentSession,
): SessionStateEntry | undefined {
  if (!session.state || !INSTANCE_DECIDED_STATES.has(session.state)) {
    return undefined;
  }
  const changedAt = session.updatedAt ? Date.parse(session.updatedAt) : NaN;
  return {
    sessionId: session.sessionId,
    state: session.state,
    ...(Number.isNaN(changedAt) ? {} : { changedAt }),
    ...(session.state === 'failed'
      ? { failureReason: readInstanceFailureReason(session.failure) }
      : {}),
  };
}

/**
 * The state entry of a session whose tasks were read: its newest turn's state.
 * Reduced to a class: the failure text is the provider's raw error and never
 * leaves the backend. A runtime kagent marked lost wins over whatever the
 * newest turn says: kagent keeps such a session READY, often on a question
 * that can now never be answered.
 */
export function taskDecidedState(
  session: KagentSession,
  tasks: A2aTaskWire[],
): SessionStateEntry {
  const newest = readNewestTaskState(tasks);
  const failureReason = isRuntimeLostReason(session.failure?.reason)
    ? 'runtime-lost'
    : newest && readTaskFailureReason(tasks[newest.index]);
  return {
    sessionId: session.sessionId,
    state: newest?.state.raw ?? null,
    ...(newest?.changedAt === undefined ? {} : { changedAt: newest.changedAt }),
    ...(failureReason === undefined ? {} : { failureReason }),
  };
}

/**
 * The top entries by count, and what the cap left out.
 *
 * Descending by count, then by name, so the answer is not Map order. The
 * remainder travels with the list so the UI can say "and 14 more, 230 calls"
 * rather than dropping the long tail silently.
 */
function topBy<T>(
  counts: Map<string | null, number>,
  make: (key: string | null, calls: number) => T,
  limit = USAGE_TOP_N,
): { top: T[]; other: UsageRemainder } {
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] ?? '').localeCompare(b[0] ?? ''),
  );
  const rest = ranked.slice(limit);
  return {
    top: ranked.slice(0, limit).map(([key, calls]) => make(key, calls)),
    other: {
      count: rest.length,
      calls: rest.reduce((sum, [, calls]) => sum + calls, 0),
    },
  };
}

/**
 * The caller's usage over a window, summed one session at a time: `add` each
 * session's tasks, then `result` the summary.
 */
export class SessionUsageRollup {
  private readonly totals = emptyTally();
  private sessionsWithActivity = 0;
  private undatedTurns = 0;
  /** Messages the reduction could not parse, over every session added. */
  unparseableMessages = 0;
  private readonly days = new Map<string, UsageTally>();
  // Sessions by the UTC day of their newest turn in the window: a narrower
  // window's session count is a trailing sum of these (see UsageDayEntry).
  private readonly lastActive = new Map<string, number>();
  private readonly tools = new Map<string | null, number>();
  private readonly servers = new Map<string | null, number>();
  private readonly agents = new Map<
    string | null,
    UsageTally & { sessions: number }
  >();

  constructor(private readonly window: { startMs: number; endMs: number }) {}

  /** One session's tasks, attributed to its agent. */
  add(session: Pick<KagentSession, 'agentId'>, tasks: A2aTaskWire[]): void {
    const usage = reduceSessionUsage(tasks, this.window);

    // A session only counts toward `sessions` if it had a turn *inside* the
    // window. Otherwise a 30-day count would include conversations that saw
    // no activity in those 30 days, and the tile would disagree with the
    // chart beside it.
    if (usage.tally.turns === 0) {
      return;
    }
    this.sessionsWithActivity += 1;

    addTally(this.totals, usage.tally);
    this.undatedTurns += usage.undatedTurns;
    this.unparseableMessages += usage.unparseableMessages;

    let newestDay: string | undefined;
    for (const [day, tally] of usage.days) {
      const existing = this.days.get(day) ?? emptyTally();
      addTally(existing, tally);
      this.days.set(day, existing);
      if (tally.turns > 0 && (!newestDay || day > newestDay)) {
        newestDay = day;
      }
    }
    if (newestDay) {
      this.lastActive.set(newestDay, (this.lastActive.get(newestDay) ?? 0) + 1);
    }
    for (const [tool, calls] of usage.tools) {
      this.tools.set(tool, (this.tools.get(tool) ?? 0) + calls);
    }
    for (const [server, calls] of usage.servers) {
      this.servers.set(server, (this.servers.get(server) ?? 0) + calls);
    }

    // Attributed to the *delegating* agent, deliberately: a child's own
    // agentId is not knowable from the response, its session is excluded
    // from the pass, and "this agent's work cost this much" is the reading
    // that is useful.
    const agentId = session.agentId ?? null;
    const agent =
      this.agents.get(agentId) ?? Object.assign(emptyTally(), { sessions: 0 });
    addTally(agent, usage.tally);
    agent.sessions += 1;
    this.agents.set(agentId, agent);
  }

  /** The summary of what was added. */
  result(options: {
    windowDays: number;
    unreadable: string[];
    skipped: number;
  }): SessionUsageResponse {
    const rankedTools = topBy<UsageToolEntry>(this.tools, (tool, calls) => ({
      tool: tool ?? 'unknown tool',
      calls,
    }));
    const rankedServers = topBy<UsageServerEntry>(
      this.servers,
      (server, calls) => ({ server, calls }),
    );
    return {
      evaluatedAt: this.window.endMs,
      windowStart: this.window.startMs,
      windowDays: options.windowDays,
      totals: { ...this.totals, sessions: this.sessionsWithActivity },
      daily: this.denseDaily(),
      byAgent: this.rankAgents(),
      topTools: rankedTools.top,
      otherTools: rankedTools.other,
      topMcpServers: rankedServers.top,
      otherMcpServers: rankedServers.other,
      undatedTurns: this.undatedTurns,
      unreadable: options.unreadable,
      skipped: options.skipped,
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
  private denseDaily(): UsageDayEntry[] {
    const daily: UsageDayEntry[] = [];
    // Walked from the window's first UTC day to its last, by key rather than by
    // adding 24 h to a timestamp, so the sequence cannot drift.
    for (let at = this.window.startMs; at <= this.window.endMs; at += DAY_MS) {
      const day = utcDayKey(at);
      if (daily.length > 0 && daily[daily.length - 1].day === day) {
        continue;
      }
      const tally = this.days.get(day);
      daily.push({
        day,
        inputTokens: tally?.inputTokens ?? 0,
        outputTokens: tally?.outputTokens ?? 0,
        turns: tally?.turns ?? 0,
        toolCalls: tally?.toolCalls ?? 0,
        lastActiveSessions: this.lastActive.get(day) ?? 0,
      });
    }
    return daily;
  }

  private rankAgents(): UsageAgentEntry[] {
    return [...this.agents.entries()]
      .map(([agentId, tally]) => ({
        agentId,
        sessions: tally.sessions,
        turns: tally.turns,
        inputTokens: tally.inputTokens,
        outputTokens: tally.outputTokens,
        ...(tally.costUsd !== undefined && { costUsd: tally.costUsd }),
      }))
      .sort(
        (a, b) =>
          b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) ||
          (a.agentId ?? '').localeCompare(b.agentId ?? ''),
      );
  }
}
