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
 * Whether an item is internal activity the `ActivityDetail` control governs.
 *
 * Approvals are deliberately **not** included: an approval is a decision the user
 * was asked to make, so hiding it would remove the record of their own action, not
 * the agent's working.
 */
export function isActivityItem(item: TimelineItem): boolean {
  return ACTIVITY_KINDS.has(item.kind);
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
