import { z } from 'zod';

/**
 * How many rows the `topTools` and `topMcpServers` lists carry.
 *
 * Exported so the UI can say "top 10" rather than implying the list is
 * exhaustive — it never is.
 */
export const USAGE_TOP_N = 10;

export type SessionUsageTotals = {
  sessions: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * kagent's reported total, which can exceed input + output — a model billing
   * thinking tokens counts them in the total and in neither part.
   */
  totalTokens: number;
  toolCalls: number;
  /** USD the runtimes reported, summed over those turns. Absent if none did. */
  costUsd?: number;
};

export type UsageDayEntry = {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  /**
   * Tool calls made in the day's turns. Absent from a backend that predates
   * the field, which is "not reported" rather than zero.
   */
  toolCalls?: number;
  /**
   * Sessions whose newest turn in the window fell on this day. The window
   * ends now, so summing a trailing run of days counts the sessions with at
   * least one turn in that run — what a narrower window's session total is.
   * Absent from a backend that predates the field.
   */
  lastActiveSessions?: number;
};

export type UsageAgentEntry = {
  /**
   * kagent's `agent_id`, raw — a python identifier (`ns__NS__name`), or `null`
   * when kagent reported none.
   *
   * Left raw and nullable rather than resolved or labelled here: the frontend
   * owns both the display name and the wording for "we don't know", which keeps
   * a copy change a frontend-only change. A reserved string like `'unknown'`
   * would also collide with an agent actually called that.
   */
  agentId: string | null;
  sessions: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  /** As {@link SessionUsageTotals.costUsd}, for this agent's turns. */
  costUsd?: number;
};

export type UsageToolEntry = { tool: string; calls: number };

/**
 * What a capped top list left out: how many entries, and the calls between
 * them. Zero and zero when the list is exhaustive.
 *
 * On the wire rather than left implied, so the UI can say "and 14 more, 230
 * calls" instead of dropping the remainder silently.
 */
export type UsageRemainder = { count: number; calls: number };

export type UsageServerEntry = {
  /**
   * The muster server segment, or `null` for a tool that is not proxied.
   *
   * `null` rather than a reserved string for the same reason as `agentId`: a
   * real muster server could be named `direct`.
   */
  server: string | null;
  calls: number;
};

/**
 * The caller's usage on one installation, as the `session-usage` route reports
 * it.
 *
 * Like `SessionStateEntry`, the shape is **ours** rather than kagent's — the
 * backend computes it. It lives here anyway because both ends depend on it, and
 * a summary the backend writes and the frontend reads differently is the same
 * class of bug that put the parsers here to begin with.
 */
export type SessionUsageResponse = {
  /** Epoch ms the summary was computed. Rendered, so staleness is visible. */
  evaluatedAt: number;
  /** Epoch ms the window starts. On the wire so the UI never recomputes it. */
  windowStart: number;
  /** The window's length. On the wire so no heading hardcodes "30 days". */
  windowDays: number;
  totals: SessionUsageTotals;
  /** Ascending by `day`, and **dense**: every UTC day in the window. */
  daily: UsageDayEntry[];
  /** Descending by input + output, then `agentId` ascending. */
  byAgent: UsageAgentEntry[];
  /** Descending by `calls`, then name ascending. At most {@link USAGE_TOP_N}. */
  topTools: UsageToolEntry[];
  /** The tools past {@link USAGE_TOP_N}: their number and their calls. */
  otherTools: UsageRemainder;
  topMcpServers: UsageServerEntry[];
  /** The servers past {@link USAGE_TOP_N}: their number and their calls. */
  otherMcpServers: UsageRemainder;
  /**
   * Turns counted in `totals` that are in no `daily` bucket, because kagent
   * wrote no usable timestamp for them. Non-zero means the charts legitimately
   * sum to less than the tiles.
   */
  undatedTurns: number;
  /** Sessions whose task read failed. Genuinely unknown, not empty. */
  unreadable: string[];
  /** Sessions that should have been evaluated and were not: cap, or budget. */
  skipped: number;
};

/**
 * A finite number, or 0.
 *
 * Every number on the wire goes through this rather than through
 * `z.number()`, and that is the point: zod *rejects* `NaN`, so validating a
 * count that way would fail its whole enclosing object and discard every valid
 * sibling with it — one bad field costing a whole totals block. Coercing here
 * keeps the failure to the field, and keeps `NaN` from ever reaching a tile
 * that would render "NaN tokens".
 */
function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * A finite non-negative number, or `undefined`.
 *
 * For fields where absence is meaningful: coercing a missing value to `0` (as
 * {@link finite} does for counts) would turn "not reported" into "none".
 */
function finiteOptional(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** Like {@link finite}, but a missing or invalid cost stays absent, not 0. */
function reportedCost(value: unknown): { costUsd?: number } {
  const costUsd = finiteOptional(value);
  return costUsd === undefined ? {} : { costUsd };
}

const totalsSchema = z.looseObject({
  sessions: z.unknown().optional(),
  turns: z.unknown().optional(),
  inputTokens: z.unknown().optional(),
  outputTokens: z.unknown().optional(),
  totalTokens: z.unknown().optional(),
  toolCalls: z.unknown().optional(),
  costUsd: z.unknown().optional(),
});

const dayEntrySchema = z.looseObject({
  day: z.string(),
  inputTokens: z.unknown().optional(),
  outputTokens: z.unknown().optional(),
  turns: z.unknown().optional(),
  toolCalls: z.unknown().optional(),
  lastActiveSessions: z.unknown().optional(),
});

const agentEntrySchema = z.looseObject({
  agentId: z.string().nullable().optional(),
  sessions: z.unknown().optional(),
  turns: z.unknown().optional(),
  inputTokens: z.unknown().optional(),
  outputTokens: z.unknown().optional(),
  costUsd: z.unknown().optional(),
});

const toolEntrySchema = z.looseObject({
  tool: z.string(),
  calls: z.unknown().optional(),
});

const serverEntrySchema = z.looseObject({
  server: z.string().nullable().optional(),
  calls: z.unknown().optional(),
});

const remainderSchema = z.looseObject({
  count: z.unknown().optional(),
  calls: z.unknown().optional(),
});

/**
 * A remainder, or none.
 *
 * A body from a backend that predates the field, or a malformed one, reads as
 * "nothing left out" — the list then renders as it always did, with no line
 * under it, rather than claiming a remainder nobody counted.
 */
function remainder(raw: unknown): UsageRemainder {
  const parsed = remainderSchema.safeParse(raw);
  if (!parsed.success) {
    return { count: 0, calls: 0 };
  }
  return { count: finite(parsed.data.count), calls: finite(parsed.data.calls) };
}

const sessionUsageSchema = z.looseObject({
  evaluatedAt: z.unknown().optional(),
  windowStart: z.unknown().optional(),
  windowDays: z.unknown().optional(),
  totals: z.unknown().optional(),
  daily: z.array(z.unknown()).optional(),
  byAgent: z.array(z.unknown()).optional(),
  topTools: z.array(z.unknown()).optional(),
  otherTools: z.unknown().optional(),
  topMcpServers: z.array(z.unknown()).optional(),
  otherMcpServers: z.unknown().optional(),
  undatedTurns: z.unknown().optional(),
  unreadable: z.array(z.unknown()).optional(),
  skipped: z.unknown().optional(),
});

function emptyUsage(): SessionUsageResponse {
  return {
    evaluatedAt: 0,
    windowStart: 0,
    windowDays: 0,
    totals: {
      sessions: 0,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
    },
    daily: [],
    byAgent: [],
    topTools: [],
    otherTools: { count: 0, calls: 0 },
    topMcpServers: [],
    otherMcpServers: { count: 0, calls: 0 },
    undatedTurns: 0,
    unreadable: [],
    skipped: 0,
  };
}

/**
 * Parse a `session-usage` body.
 *
 * **Never throws, and never fails whole.** The page renders a summary beside
 * copy that already admits it can be incomplete, so the failure that matters is
 * losing every number to one bad row: entries are validated individually and a
 * malformed one is dropped, in the same spirit as `normalizeSessionStates`. A
 * body that is not an object at all yields a zeroed summary, which the page
 * renders as "no usage in the window" rather than as an error — the honest
 * reading when the backend answered and we could not understand it.
 */
export function normalizeSessionUsage(raw: unknown): SessionUsageResponse {
  const parsed = sessionUsageSchema.safeParse(raw);
  if (!parsed.success) {
    return emptyUsage();
  }

  const empty = emptyUsage();

  const totalsParsed = totalsSchema.safeParse(parsed.data.totals);
  const totals: SessionUsageTotals = totalsParsed.success
    ? {
        sessions: finite(totalsParsed.data.sessions),
        turns: finite(totalsParsed.data.turns),
        inputTokens: finite(totalsParsed.data.inputTokens),
        outputTokens: finite(totalsParsed.data.outputTokens),
        totalTokens: finite(totalsParsed.data.totalTokens),
        toolCalls: finite(totalsParsed.data.toolCalls),
        ...reportedCost(totalsParsed.data.costUsd),
      }
    : empty.totals;

  const daily: UsageDayEntry[] = [];
  for (const candidate of parsed.data.daily ?? []) {
    const entry = dayEntrySchema.safeParse(candidate);
    if (!entry.success || !entry.data.day) {
      continue;
    }
    const toolCalls = finiteOptional(entry.data.toolCalls);
    const lastActiveSessions = finiteOptional(entry.data.lastActiveSessions);
    daily.push({
      day: entry.data.day,
      inputTokens: finite(entry.data.inputTokens),
      outputTokens: finite(entry.data.outputTokens),
      turns: finite(entry.data.turns),
      ...(toolCalls !== undefined && { toolCalls }),
      ...(lastActiveSessions !== undefined && { lastActiveSessions }),
    });
  }

  const byAgent: UsageAgentEntry[] = [];
  for (const candidate of parsed.data.byAgent ?? []) {
    const entry = agentEntrySchema.safeParse(candidate);
    if (!entry.success) {
      continue;
    }
    byAgent.push({
      agentId: entry.data.agentId ?? null,
      sessions: finite(entry.data.sessions),
      turns: finite(entry.data.turns),
      inputTokens: finite(entry.data.inputTokens),
      outputTokens: finite(entry.data.outputTokens),
      ...reportedCost(entry.data.costUsd),
    });
  }

  const topTools: UsageToolEntry[] = [];
  for (const candidate of parsed.data.topTools ?? []) {
    const entry = toolEntrySchema.safeParse(candidate);
    if (!entry.success || !entry.data.tool) {
      continue;
    }
    topTools.push({ tool: entry.data.tool, calls: finite(entry.data.calls) });
  }

  const topMcpServers: UsageServerEntry[] = [];
  for (const candidate of parsed.data.topMcpServers ?? []) {
    const entry = serverEntrySchema.safeParse(candidate);
    if (!entry.success) {
      continue;
    }
    topMcpServers.push({
      server: entry.data.server ?? null,
      calls: finite(entry.data.calls),
    });
  }

  return {
    evaluatedAt: finite(parsed.data.evaluatedAt),
    windowStart: finite(parsed.data.windowStart),
    windowDays: finite(parsed.data.windowDays),
    totals,
    daily,
    byAgent,
    topTools,
    otherTools: remainder(parsed.data.otherTools),
    topMcpServers,
    otherMcpServers: remainder(parsed.data.otherMcpServers),
    undatedTurns: finite(parsed.data.undatedTurns),
    unreadable: (parsed.data.unreadable ?? []).filter(
      (id): id is string => typeof id === 'string',
    ),
    skipped: finite(parsed.data.skipped),
  };
}
