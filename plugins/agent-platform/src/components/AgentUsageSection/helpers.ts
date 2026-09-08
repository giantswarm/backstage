import {
  SessionUsageResponse,
  UsageDayEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentRow } from '../AgentsDataProvider';
import { buildAgentIndex, decodeAgentIdLabel } from '../SessionsDataProvider';

export type ByModelRow = {
  id: string;
  /** The model label, or the caller's wording for "we cannot tell". */
  model: string;
  /** How many of the reader's agents ran on it in the window. */
  agents: number;
  sessions: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
};

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
 * Sort a usage breakdown for the bui table.
 *
 * `useTable` in `complete` mode needs this: `sortFn` is optional in the type,
 * but without one it has no way to compare rows, so every column header moves
 * its indicator and re-renders the same order. That is exactly how the By agent
 * table shipped broken once.
 *
 * Always tie-breaks on the row's label, so equal counts render in a stable
 * order rather than however the backend's ranking happened to leave them.
 */
export function sortUsageRows<T extends Record<string, unknown>>(
  rows: T[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
  labelKey: keyof T & string,
): T[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const label = (row: T) => String(row[labelKey] ?? '');

  return [...rows].sort((a, b) => {
    if (column === labelKey) {
      return label(a).localeCompare(label(b)) * factor;
    }

    const left = a[column];
    const right = b[column];
    if (typeof left !== 'number' || typeof right !== 'number') {
      // An unsortable or unknown column: keep the incoming order rather than
      // inventing one.
      return 0;
    }
    return left === right
      ? label(a).localeCompare(label(b))
      : (left - right) * factor;
  });
}

/**
 * Roll the per-agent totals up by the model each agent runs on.
 *
 * Purely a frontend join: kagent's usage carries no model, and its session
 * record carries none either — the model is read off the agent's `Agent` CR,
 * which `AgentsDataProvider` has already resolved through its ModelConfig.
 *
 * **This is the agent's model *now*, not the model each session actually ran
 * on.** kagent records no per-session model and does not pin an agent version
 * to a session (see the "agent version is not pinned" note in
 * `docs/agent-platform.md`), so if an agent's ModelConfig changed inside the
 * window, that agent's whole history is attributed to its current model. The
 * table says so rather than implying a historical breakdown.
 *
 * An agent whose CR is not in view — deleted since, or on another installation —
 * has no knowable model and lands under the caller's `unknownLabel`, together
 * with agents that genuinely reference none (BYO agents). Its spend is still
 * part of the totals above, so dropping it would make the table disagree with
 * them.
 */
export function toByModelRows(
  byAgent: SessionUsageResponse['byAgent'],
  installation: string | undefined,
  agents: AgentRow[],
  unknownLabel: string,
): ByModelRow[] {
  const index = buildAgentIndex(agents);
  const byModel = new Map<string | null, ByModelRow>();

  for (const entry of byAgent) {
    const matched =
      entry.agentId === null || installation === undefined
        ? undefined
        : index.get(`${installation}|${entry.agentId}`);
    const model = matched?.model ?? null;

    const row =
      byModel.get(model) ??
      ({
        id: model ?? 'unknown-model',
        model: model ?? unknownLabel,
        agents: 0,
        sessions: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
      } satisfies ByModelRow);

    row.agents += 1;
    row.sessions += entry.sessions;
    row.turns += entry.turns;
    row.inputTokens += entry.inputTokens;
    row.outputTokens += entry.outputTokens;
    byModel.set(model, row);
  }

  return [...byModel.values()].sort(
    (a, b) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) ||
      a.model.localeCompare(b.model),
  );
}
