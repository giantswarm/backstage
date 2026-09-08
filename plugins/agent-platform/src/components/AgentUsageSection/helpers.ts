import {
  SessionUsageResponse,
  UsageDayEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentRow } from '../AgentsDataProvider';
import { buildAgentIndex, decodeAgentIdLabel } from '../SessionsDataProvider';

export type ByAgentRow = {
  id: string;
  /** Display name when the agent's CR matched, else the decoded id. */
  agentName: string;
  href?: string;
  sessions: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Join the backend's per-agent totals against the fleet's `Agent` CRs.
 *
 * Reuses the sessions list's index and decoder rather than matching ids here:
 * kagent's encoding replaces `-` with `_` as well as `/` with `__NS__`, so a
 * naive key never matches — which a test caught after I wrote exactly that.
 * One encoder, shared, is also what keeps the two surfaces naming the same
 * agent the same way.
 *
 * An id that matches no CR is kept and shown decoded rather than dropped: the
 * agent may have been deleted since, and its spend is still part of the total
 * above it. Dropping it would make the table disagree with the tiles.
 */
export function toByAgentRows(
  byAgent: SessionUsageResponse['byAgent'],
  installation: string | undefined,
  agents: AgentRow[],
  hrefFor: (row: AgentRow) => string | undefined,
  unknownLabel: string,
): ByAgentRow[] {
  const index = buildAgentIndex(agents);

  return byAgent.map((entry, position) => {
    if (entry.agentId === null) {
      return {
        id: `unknown-${position}`,
        agentName: unknownLabel,
        sessions: entry.sessions,
        turns: entry.turns,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
      };
    }
    const matched =
      installation === undefined
        ? undefined
        : index.get(`${installation}|${entry.agentId}`);
    return {
      id: entry.agentId,
      agentName: matched?.name ?? decodeAgentIdLabel(entry.agentId),
      href: matched ? hrefFor(matched) : undefined,
      sessions: entry.sessions,
      turns: entry.turns,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
    };
  });
}

/**
 * Whether the window holds anything worth rendering.
 *
 * A strip of zeros beside two empty charts reads as a broken page, so the
 * section says "nothing in this window" instead.
 */
export function hasAnyUsage(usage: SessionUsageResponse | undefined): boolean {
  return (usage?.totals.sessions ?? 0) > 0;
}

/**
 * Fill any gap in the day series with zeros.
 *
 * The backend already answers densely, because it owns the window. This is the
 * belt to that braces: a bar chart handed a sparse series silently compresses
 * the timeline, showing N bars that do not mean N days, and that failure is
 * invisible rather than loud.
 */
export function fillMissingDays(
  daily: UsageDayEntry[],
  windowDays: number,
): UsageDayEntry[] {
  if (daily.length === 0 || windowDays <= 0) {
    return daily;
  }
  const byDay = new Map(daily.map(entry => [entry.day, entry]));
  const start = Date.parse(`${daily[0].day}T00:00:00Z`);
  if (Number.isNaN(start)) {
    return daily;
  }

  const filled: UsageDayEntry[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let i = 0; i <= windowDays; i += 1) {
    const day = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    filled.push(
      byDay.get(day) ?? { day, inputTokens: 0, outputTokens: 0, turns: 0 },
    );
  }
  return filled;
}

/** `2026-09-04` as `4 Sep`, matching muster's daily axis. */
export function formatDayTick(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) {
    return day;
  }
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** `2026-09-04` as `Fri, 4 Sep 2026` for the tooltip heading. */
export function formatDayTooltip(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) {
    return day;
  }
  return new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Sort the by-agent rows for the bui table.
 *
 * `useTable` in `complete` mode needs this: `sortFn` is optional in the type,
 * but without one it has no way to compare rows, so every column header moves
 * its indicator and re-renders the same order. That is exactly how this table
 * shipped broken once.
 *
 * Always tie-breaks on the agent name, so equal counts render in a stable order
 * rather than however the backend's ranking happened to leave them.
 */
export function sortByAgentRows(
  rows: ByAgentRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): ByAgentRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (column === 'agentName') {
      return a.agentName.localeCompare(b.agentName) * factor;
    }

    const key =
      column === 'sessions' ||
      column === 'turns' ||
      column === 'inputTokens' ||
      column === 'outputTokens'
        ? column
        : 'inputTokens';

    return a[key] === b[key]
      ? a.agentName.localeCompare(b.agentName)
      : (a[key] - b[key]) * factor;
  });
}
