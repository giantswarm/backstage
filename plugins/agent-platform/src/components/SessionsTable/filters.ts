import {
  AWAITING_INPUT_STATES,
  CANCELED_STATE,
  FAILED_STATES,
  SHELL_STATE_LABELS,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  SessionTableRow,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
} from './helpers';

/**
 * The State chips' buckets. Each chip is named after the State cell label of
 * most of its rows; the others are close kin that the person acts on the same
 * way: "Authentication required" under "Waiting for input" (both wait on the
 * person), "Submitted" under "Working", "Rejected" under "Failed", "Canceled"
 * under "Completed" (ended, nothing left to do). "Unknown" holds unreadable
 * sessions and any state kagent reports that the portal does not recognise.
 * Rows whose state has not been loaded are a fact about this page, not the
 * session, so only "All" holds them.
 */
export type SessionStateFilter =
  'all' | 'waiting' | 'running' | 'failed' | 'finished' | 'idle' | 'unknown';

export const SESSION_STATE_FILTERS: ReadonlyArray<{
  id: SessionStateFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting for input' },
  { id: 'running', label: 'Working' },
  { id: 'failed', label: 'Failed' },
  { id: 'finished', label: 'Completed' },
  { id: 'idle', label: STATE_IDLE_LABEL },
  { id: 'unknown', label: STATE_UNKNOWN_LABEL },
];

/**
 * The shell's State chips: the same buckets, named in the shell's four state
 * words. `whenPresent` chips show only while a row falls in them, because the
 * shell does not name those as states of their own.
 */
export const SHELL_SESSION_STATE_FILTERS: ReadonlyArray<{
  id: SessionStateFilter;
  label: string;
  whenPresent?: boolean;
}> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: SHELL_STATE_LABELS.waiting },
  { id: 'running', label: SHELL_STATE_LABELS.working },
  { id: 'finished', label: SHELL_STATE_LABELS.finished },
  { id: 'failed', label: SHELL_STATE_LABELS.failed },
  { id: 'idle', label: STATE_IDLE_LABEL, whenPresent: true },
  { id: 'unknown', label: STATE_UNKNOWN_LABEL, whenPresent: true },
];

export type SessionsFilter = {
  state: SessionStateFilter;
  /** An {@link agentKey}; every agent when undefined. */
  agent?: string;
};

export const NO_SESSIONS_FILTER: SessionsFilter = { state: 'all' };

export function isSessionsFilterActive(filter: SessionsFilter): boolean {
  return filter.state !== 'all' || filter.agent !== undefined;
}

const RUNNING_STATES = new Set(['submitted', 'working']);
const COMPLETED_STATES = new Set(['completed', CANCELED_STATE]);

function stateBucket(row: SessionTableRow): SessionStateFilter | undefined {
  const cell = row.stateCell;
  switch (cell.kind) {
    case 'idle':
      return 'idle';
    case 'unreadable':
      return 'unknown';
    case 'unevaluated':
      return undefined;
    default:
      break;
  }
  const { key } = cell.state;
  if (AWAITING_INPUT_STATES.has(key)) return 'waiting';
  if (RUNNING_STATES.has(key)) return 'running';
  if (FAILED_STATES.has(key)) return 'failed';
  if (COMPLETED_STATES.has(key)) return 'finished';
  return 'unknown';
}

function matchesState(row: SessionTableRow, state: SessionStateFilter) {
  return state === 'all' || stateBucket(row) === state;
}

/**
 * The agent a row belongs to: installation, namespace and name of its Agent
 * CR, or the installation and display name when no CR matched. Undefined for
 * a row with neither.
 */
export function agentKey(row: SessionTableRow): string | undefined {
  if (row.agentNamespace && row.agentTechnicalName) {
    return [row.installation, row.agentNamespace, row.agentTechnicalName].join(
      '/',
    );
  }
  return row.agentName
    ? [row.installation, '', row.agentName].join('/')
    : undefined;
}

function matchesAgent(row: SessionTableRow, agent: string | undefined) {
  return agent === undefined || agentKey(row) === agent;
}

export function filterSessions(
  rows: SessionTableRow[],
  filter: SessionsFilter,
): SessionTableRow[] {
  return rows.filter(
    row => matchesState(row, filter.state) && matchesAgent(row, filter.agent),
  );
}

/**
 * Rows per State chip among the given rows of the chosen agent, so each count
 * says what picking that chip would show when given the rows the search
 * matched. Rows whose state is not loaded count only towards "All".
 */
export function countSessionsByState(
  rows: SessionTableRow[],
  agent: string | undefined,
): Record<SessionStateFilter, number> {
  const counts = Object.fromEntries(
    SESSION_STATE_FILTERS.map(({ id }) => [id, 0]),
  ) as Record<SessionStateFilter, number>;
  for (const row of rows) {
    if (!matchesAgent(row, agent)) {
      continue;
    }
    counts.all += 1;
    const bucket = stateBucket(row);
    if (bucket) {
      counts[bucket] += 1;
    }
  }
  return counts;
}

type AgentEntry = {
  key: string;
  name: string;
  installation: string;
  namespace?: string;
};

/**
 * The agents the rows belong to, each once, alphabetically. A name two agents
 * share carries its installation, and its namespace too when that is not
 * enough.
 */
export function sessionAgentOptions(
  rows: SessionTableRow[],
): Array<{ id: string; label: string }> {
  const agents = new Map<string, AgentEntry>();
  for (const row of rows) {
    const key = agentKey(row);
    if (key && !agents.has(key)) {
      agents.set(key, {
        key,
        name: row.agentName || row.agentTechnicalName || key,
        installation: row.installation,
        namespace: row.agentNamespace,
      });
    }
  }

  const byName = new Map<string, AgentEntry[]>();
  for (const agent of agents.values()) {
    byName.set(agent.name, [...(byName.get(agent.name) ?? []), agent]);
  }

  const options = [...agents.values()].map(agent => {
    const namesakes = byName.get(agent.name) ?? [];
    if (namesakes.length === 1) {
      return { id: agent.key, label: agent.name };
    }
    const sameInstallation = namesakes.filter(
      other => other.installation === agent.installation,
    );
    const where =
      sameInstallation.length === 1 || !agent.namespace
        ? agent.installation
        : `${agent.installation}/${agent.namespace}`;
    return { id: agent.key, label: `${agent.name} (${where})` };
  });
  return options.sort((a, b) => a.label.localeCompare(b.label));
}
