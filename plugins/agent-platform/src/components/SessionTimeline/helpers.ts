import { TimelineItem } from '../../lib/kagentTimeline';
import { decodeAgentIdLabel } from '../SessionsDataProvider/helpers';

/**
 * How much of the agent's internal work the timeline shows.
 *
 * The prototype makes this a real control rather than a fixed state, because
 * seeing "what the agent actually did" is the point of the screen — but a wall of
 * expanded tool payloads is unreadable, so `collapsed` is the default.
 */
export type ActivityDetail = 'hidden' | 'collapsed' | 'expanded';

/** Items that represent the agent's internal work rather than the conversation. */
const ACTIVITY_KINDS = new Set<TimelineItem['kind']>([
  'reasoning',
  'tool-call',
  'agent-call',
]);

/**
 * Whether an item is internal activity that `hidden` removes.
 *
 * Approvals are deliberately **not** included: an approval is a decision the user
 * was asked to make, so hiding it would remove the record of their own action, not
 * the agent's working. Nor is a failed turn: it is the outcome of the turn, and
 * hiding it would put the page back to showing a message that went unanswered for
 * no visible reason.
 *
 * Note this governs *hiding* only. Approvals still expand and collapse with the
 * control — see {@link hasExpandableDetail}.
 */
export function isActivityItem(item: TimelineItem): boolean {
  return ACTIVITY_KINDS.has(item.kind);
}

/**
 * The payloads an item reveals when expanded, or `undefined` when it has none.
 *
 * Shared by the entry (which renders them) and the list (which decides whether to
 * offer the expand/collapse control at all), so the two cannot disagree about what
 * is expandable.
 */
export function expandablePayloads(
  item: TimelineItem,
): { args?: string; result?: string } | undefined {
  if (
    item.kind !== 'tool-call' &&
    item.kind !== 'agent-call' &&
    item.kind !== 'approval'
  ) {
    return undefined;
  }
  // A question's args *are* the questions, and those now render as prose on the
  // row itself. Repeating them as a JSON payload behind an expander would offer a
  // click that reveals a worse copy of what is already on screen.
  if (item.kind === 'approval' && item.questions?.length) {
    return undefined;
  }
  const args = formatPayload(item.args);
  // An approval has no result — it carries the *proposed* call, which never ran as
  // this item.
  const result =
    item.kind === 'approval' ? undefined : formatPayload(item.result);
  if (!args && !result) {
    return undefined;
  }
  return { args, result };
}

/**
 * Whether an entry has anything behind an expander.
 *
 * Reasoning always does. Everything else depends on what kagent recorded — an
 * approval or tool call with no payload renders as a plain row instead, because an
 * expander that opens onto nothing invites a click and answers with nothing.
 */
export function hasExpandableDetail(item: TimelineItem): boolean {
  return item.kind === 'reasoning' || Boolean(expandablePayloads(item));
}

export type TimelineTurn = {
  taskIndex: number;
  /**
   * One timestamp for the whole turn. A2A messages carry none of their own and
   * kagent's stored events cannot be correlated with them, so a task's timestamp
   * is the finest granularity that exists — presenting it per turn is honest,
   * repeating it on every item would imply precision we don't have.
   */
  at?: string;
  items: TimelineItem[];
};

/**
 * Group a flat timeline into turns, preserving order.
 *
 * Grouping is on `taskIndex` runs rather than a map keyed by it, so items always
 * stay in the order `buildTimeline` produced even if a task index were ever to
 * repeat non-contiguously.
 */
export function groupIntoTurns(items: TimelineItem[]): TimelineTurn[] {
  const turns: TimelineTurn[] = [];
  for (const item of items) {
    const current = turns[turns.length - 1];
    if (current && current.taskIndex === item.taskIndex) {
      current.items.push(item);
      continue;
    }
    turns.push({ taskIndex: item.taskIndex, at: item.at, items: [item] });
  }
  return turns;
}

/**
 * Display name for whoever produced an item.
 *
 * `author` arrives as a python identifier (`sre_agent`), so it is decoded for
 * display. `resolvedAgentName` — the matched `Agent` CR's display name — wins when
 * available, since decoding is lossy: an agent whose name genuinely contains an
 * underscore renders wrongly.
 */
export function authorLabel(
  item: TimelineItem,
  resolvedAgentName?: string,
): string | undefined {
  if (item.kind === 'user-message') {
    return undefined;
  }
  if (resolvedAgentName) {
    return resolvedAgentName;
  }
  return item.author ? decodeAgentIdLabel(item.author) : undefined;
}

/** Human label for a delegation target, decoded from its python identifier. */
export function agentCallLabel(agentId: string): string {
  const decoded = decodeAgentIdLabel(agentId);
  // `ns/name` reads as noise in a timeline row; the name alone is the useful part.
  const slash = decoded.lastIndexOf('/');
  return slash === -1 ? decoded : decoded.slice(slash + 1);
}

/**
 * Pretty-print a tool argument or result for display.
 *
 * Strings are returned as-is: tool results are frequently already-formatted text
 * or JSON, and re-encoding them would show escaped quotes and `\n` instead of the
 * content. Everything else is JSON with indentation.
 */
export function formatPayload(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Circular or otherwise unserializable. Nothing useful to show, and this must
    // not take the page down.
    return undefined;
  }
}

/** One-line summary of a tool call's arguments, for the collapsed row. */
export function summarizeArgs(args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return formatPayload(args)?.split('\n')[0];
  }
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) {
    return undefined;
  }
  return entries
    .map(([key, value]) => {
      const rendered =
        typeof value === 'string' ? value : (formatPayload(value) ?? '');
      const flattened = rendered.replace(/\s+/g, ' ').trim();
      return `${key}: ${flattened}`;
    })
    .join(', ');
}

/** Format a token count compactly (`1.5k`, `1.2M`). */
export function formatTokens(total: number): string {
  if (total < 1000) {
    return String(total);
  }
  if (total < 1_000_000) {
    return `${(total / 1000).toFixed(1)}k`;
  }
  return `${(total / 1_000_000).toFixed(1)}M`;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long a session spanned, from its first to its last activity.
 *
 * **Wall-clock, not compute time.** kagent records no per-turn durations, so this
 * is `updated_at − created_at`: it includes however long the user was away between
 * turns. A session answered in seconds and returned to the next day reads as a day
 * — which is the truth about the session, just not about the agent's effort.
 *
 * Returns undefined when either end is unknown, or when the span is negative
 * (clock skew between the writer and us) rather than rendering something absurd.
 */
export function formatDuration(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  if (!from || !to) {
    return undefined;
  }
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }
  const ms = end - start;
  if (ms < 0) {
    return undefined;
  }
  // Sub-minute spans are real — a one-shot question answered immediately — so
  // seconds are worth showing rather than rounding to "0m".
  if (ms < MINUTE_MS) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < HOUR_MS) {
    return `${Math.floor(ms / MINUTE_MS)}m`;
  }
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
