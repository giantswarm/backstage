import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import { TimelineItem } from '../../lib/kagentTimeline';
import { decodeAgentIdLabel } from '../SessionsDataProvider/helpers';

/**
 * A tool's name as a readable phrase, for the plain trace: `github_search_issues`
 * → `Github search issues`. Lossy on purpose — the exact identifier is one
 * fold-out away, on the row itself — and left alone when there is nothing to
 * split, so an unrecognisable name still names the tool.
 */
export function humanizeToolName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) {
    return name;
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
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
 * Items a turn's work summary folds away: what the agent did on its way to the
 * reply. Approvals are not among them — a question is the last thing the agent
 * said, and a permission request is a decision the person took, so both stay
 * in the conversation where they can be read.
 */
const WORK_KINDS = new Set<TimelineItem['kind']>([
  'reasoning',
  'tool-call',
  'agent-call',
]);

function isCall(item: TimelineItem): boolean {
  return item.kind === 'tool-call' || item.kind === 'agent-call';
}

/**
 * One piece of a turn as the timeline lays it out: an entry on its own, or a
 * run of the agent's work folded under one summary line.
 */
export type TimelineSegment =
  | { kind: 'item'; item: TimelineItem }
  | { kind: 'work'; id: string; items: TimelineItem[] };

/**
 * Split a turn's items into what reads as conversation and what folds into a
 * work summary, preserving order.
 *
 * Folded per **run** of consecutive work items, not per turn: an agent that
 * says "let me look" before its calls and answers after them keeps both
 * sentences where it said them. Every run that holds at least one call folds,
 * a lone call included (T40): "Used 1 tool" opens onto a list of one exactly as
 * "Used 3 tools" opens onto three, so the reader learns one gesture rather than
 * two layouts that depend on how much the agent happened to do. Reasoning on
 * its own is prose with its own expander, and stays inline.
 */
export function segmentTurn(items: TimelineItem[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let run: TimelineItem[] = [];
  const flush = () => {
    if (run.some(isCall)) {
      segments.push({ kind: 'work', id: run[0].id, items: run });
    } else {
      for (const item of run) {
        segments.push({ kind: 'item', item });
      }
    }
    run = [];
  };
  for (const item of items) {
    if (WORK_KINDS.has(item.kind)) {
      run.push(item);
      continue;
    }
    flush();
    segments.push({ kind: 'item', item });
  }
  flush();
  return segments;
}

export type WorkSummary = {
  /** The plain summary line, e.g. "Loaded 1 skill · Used 3 tools". */
  label: string;
  /** The technical count, e.g. "5 steps · 45 tool calls". */
  technicalLabel: string;
};

/** The ADK built-in an agent reads one of its mounted skills with. */
const LOAD_SKILL_TOOL = 'load_skill';

/**
 * Which skill a `load_skill` call loaded, for counting distinct skills. Falls
 * back to the call's id when the arguments do not say, so an unreadable call
 * still counts as one load rather than collapsing into another.
 */
function loadedSkillKey(
  item: Extract<TimelineItem, { kind: 'tool-call' }>,
): string {
  const args = item.args;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    for (const key of ['name', 'skill_name', 'skill']) {
      if (typeof record[key] === 'string' && record[key]) {
        return record[key] as string;
      }
    }
  }
  return item.id;
}

/**
 * What a folded run of work amounts to, in the prototype's words.
 *
 * Tools are counted by name, not by call — the prototype's "Used 3 tools"
 * stands over 45 calls — and the exact call count is the technical line's.
 * Skill loads and delegations are named apart: reading a skill and asking
 * another agent are different things to have done than running a tool. No
 * duration: kagent records no per-call timing, and a turn's one timestamp
 * cannot say how long its work took.
 */
export function summarizeWork(items: TimelineItem[]): WorkSummary {
  const skills = new Set<string>();
  const tools = new Set<string>();
  const agents = new Set<string>();
  let calls = 0;
  for (const item of items) {
    if (item.kind === 'tool-call') {
      if (item.toolName === LOAD_SKILL_TOOL) {
        skills.add(loadedSkillKey(item));
      } else {
        tools.add(item.toolName);
      }
      calls += 1;
    } else if (item.kind === 'agent-call') {
      agents.add(item.agentId);
      calls += 1;
    }
  }
  const parts: string[] = [];
  if (skills.size > 0) {
    parts.push(`Loaded ${countNoun(skills.size, 'skill')}`);
  }
  if (tools.size > 0) {
    parts.push(`Used ${countNoun(tools.size, 'tool')}`);
  }
  if (agents.size > 0) {
    parts.push(`Asked ${countNoun(agents.size, 'agent')}`);
  }
  return {
    label: parts.join(' · '),
    technicalLabel: `${countNoun(items.length, 'step')} · ${countNoun(
      calls,
      'tool call',
    )}`,
  };
}

/** Whether an item is on the user's side of the conversation. */
export function isUserItem(item: TimelineItem): boolean {
  return (
    item.kind === 'user-message' || (item.kind === 'attachment' && item.isUser)
  );
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
  if (isUserItem(item)) {
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

// Moved to `lib/formatNumbers` once the Usage page needed it too. Re-exported
// here so this module's barrel keeps exporting it and its callers do not churn.
export { formatTokens } from '../../lib/formatNumbers';
