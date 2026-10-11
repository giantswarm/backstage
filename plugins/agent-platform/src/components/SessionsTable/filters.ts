import {
  AWAITING_INPUT_STATES,
  CANCELED_STATE,
  FAILED_STATES,
  SESSION_STATE_LABELS,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  applyCatalogFilters,
  type CatalogFacet,
  type CatalogFilterSelection,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  SessionTableRow,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
} from './helpers';

/**
 * The State chips' buckets. Each chip is named after the State cell label of
 * most of its rows; the others are close kin that the person acts on the same
 * way: auth-required under "Waiting for you" (both wait on the person),
 * submitted under "Working", rejected under "Failed", canceled under
 * "Finished" (ended, nothing left to do) — the buckets `describeSessionState`
 * names them by. "Unknown" holds unreadable
 * sessions and any state kagent reports that the portal does not recognise.
 * Rows whose state has not been loaded are a fact about this page, not the
 * session, so only "All" holds them.
 *
 * "Pinned" is not a state but rides the same single-select chips: the shell
 * offers it beside the state chips, and a row is in it by its `pinned` flag
 * whatever its state. The classic chips do not offer it.
 */
export type SessionStateFilter =
  | 'all'
  | 'pinned'
  | 'waiting'
  | 'running'
  | 'failed'
  | 'finished'
  | 'idle'
  | 'unknown';

/** Every chip id, for the counts record — the two chip sets each show a subset. */
const ALL_FILTER_IDS: ReadonlyArray<SessionStateFilter> = [
  'all',
  'pinned',
  'waiting',
  'running',
  'failed',
  'finished',
  'idle',
  'unknown',
];

export const SESSION_STATE_FILTERS: ReadonlyArray<{
  id: SessionStateFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: SESSION_STATE_LABELS.waiting },
  { id: 'running', label: SESSION_STATE_LABELS.working },
  { id: 'failed', label: SESSION_STATE_LABELS.failed },
  { id: 'finished', label: SESSION_STATE_LABELS.finished },
  { id: 'idle', label: STATE_IDLE_LABEL },
  { id: 'unknown', label: STATE_UNKNOWN_LABEL },
];

/**
 * The shell's State chips: the same buckets, in the same four state words.
 * `whenPresent` chips show only while a row falls in them, because the
 * shell does not name those as states of their own.
 */
export const SHELL_SESSION_STATE_FILTERS: ReadonlyArray<{
  id: SessionStateFilter;
  label: string;
  whenPresent?: boolean;
}> = [
  { id: 'all', label: 'All' },
  // Only once something is pinned: before the first pin the chip filters down
  // to nothing, and the affordance that introduces pinning is the row's pin.
  { id: 'pinned', label: 'Pinned', whenPresent: true },
  { id: 'waiting', label: SESSION_STATE_LABELS.waiting },
  { id: 'running', label: SESSION_STATE_LABELS.working },
  { id: 'finished', label: SESSION_STATE_LABELS.finished },
  { id: 'failed', label: SESSION_STATE_LABELS.failed },
  { id: 'idle', label: STATE_IDLE_LABEL, whenPresent: true },
  { id: 'unknown', label: STATE_UNKNOWN_LABEL, whenPresent: true },
];

export type SessionsFilter = {
  state: SessionStateFilter;
  /** An {@link agentKey}; every agent when undefined. */
  agent?: string;
};

export const NO_SESSIONS_FILTER: SessionsFilter = { state: 'all' };

/**
 * The query parameters the shell's sessions list opens with: `q` seeds its
 * search, `state` one of its chips. Links that hand the person a narrowed
 * list — the palette's "+N more sessions", the toast for several sessions
 * waiting at once — say what to narrow to this way.
 */
export const SESSIONS_QUERY_PARAM = 'q';
export const SESSIONS_STATE_PARAM = 'state';

/** The query string (with its `?`, or empty) for a narrowed sessions list. */
export function sessionsListSearch({
  query,
  state,
}: {
  query?: string;
  state?: SessionStateFilter;
}): string {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set(SESSIONS_QUERY_PARAM, query.trim());
  }
  if (state && state !== 'all') {
    params.set(SESSIONS_STATE_PARAM, state);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * What a sessions-list URL asks to open with; an unknown `state` is ignored
 * rather than filtering down to nothing.
 */
export function parseSessionsListSearch(search: string): {
  query: string;
  filter: SessionsFilter;
} {
  const params = new URLSearchParams(search);
  const state = params.get(SESSIONS_STATE_PARAM);
  const known = ALL_FILTER_IDS.find(id => id === state);
  return {
    query: params.get(SESSIONS_QUERY_PARAM)?.trim() ?? '',
    filter: known ? { state: known } : NO_SESSIONS_FILTER,
  };
}

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
  if (state === 'all') {
    return true;
  }
  if (state === 'pinned') {
    return row.pinned === true;
  }
  return stateBucket(row) === state;
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
 * matched. Rows whose state is not loaded count only towards "All". A pinned
 * row counts towards "Pinned" *and* its state's chip — pinning says nothing
 * about the state.
 */
export function countSessionsByState(
  rows: SessionTableRow[],
  agent: string | undefined,
): Record<SessionStateFilter, number> {
  const counts = Object.fromEntries(
    ALL_FILTER_IDS.map(id => [id, 0]),
  ) as Record<SessionStateFilter, number>;
  for (const row of rows) {
    if (!matchesAgent(row, agent)) {
      continue;
    }
    counts.all += 1;
    if (row.pinned) {
      counts.pinned += 1;
    }
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

/**
 * The shell list's filters (T92): the shared catalog dropdowns —
 * `CatalogFilterBar`, the idiom every Customize tab uses — over three facets.
 * State and Agent are multi-selects (picks within one widen, the two narrow
 * each other); Pinned is a dropdown of one option, drawn only once something
 * is pinned, like the Agents tab's Favorites. Each option counts what picking
 * it would show under the search and the other picks.
 */
export const SESSION_STATE_FACET = 'state';
export const SESSION_AGENT_FACET = 'agent';
export const SESSION_PINNED_FACET = 'pinned';

const PINNED_VALUE = 'pinned';

/** The shell's state options, in its order and words. */
const SHELL_STATE_OPTIONS = SHELL_SESSION_STATE_FILTERS.filter(
  ({ id }) => id !== 'all' && id !== 'pinned',
);

/**
 * The facets, as filtering needs them: a value per row, nothing that depends
 * on the rows in hand. {@link sessionFacets} adds how each value reads.
 */
const SESSION_FACETS: ReadonlyArray<CatalogFacet<SessionTableRow>> = [
  {
    id: SESSION_STATE_FACET,
    label: 'State',
    // Rows whose state is not loaded have no value: only an unfiltered State
    // keeps them, as only "All" did.
    value: row => stateBucket(row),
    optionLabel: value =>
      SHELL_STATE_OPTIONS.find(({ id }) => id === value)?.label ?? value,
    order: SHELL_STATE_OPTIONS.map(({ id }) => id),
  },
  {
    id: SESSION_AGENT_FACET,
    label: 'Agent',
    value: row => agentKey(row),
  },
  {
    id: SESSION_PINNED_FACET,
    label: 'Pinned',
    value: row => (row.pinned ? PINNED_VALUE : undefined),
    optionLabel: () => 'Pinned',
  },
];

/**
 * The facets to draw: the agent options named as {@link sessionAgentOptions}
 * names them (none on one agent's own sessions), and State only where the
 * list has states at all.
 */
export function sessionFacets(
  rows: SessionTableRow[],
  {
    showStates,
    showAgents = true,
  }: { showStates: boolean; showAgents?: boolean },
): CatalogFacet<SessionTableRow>[] {
  const agentLabels = new Map(
    sessionAgentOptions(rows).map(option => [option.id, option.label]),
  );
  return SESSION_FACETS.filter(
    facet =>
      (showStates || facet.id !== SESSION_STATE_FACET) &&
      (showAgents || facet.id !== SESSION_AGENT_FACET),
  ).map(facet =>
    facet.id === SESSION_AGENT_FACET
      ? { ...facet, optionLabel: value => agentLabels.get(value) ?? value }
      : facet,
  );
}

/** The rows every facet's picks keep — the shell table's `filterFn`. */
export function filterSessionsBySelection(
  rows: SessionTableRow[],
  selection: CatalogFilterSelection,
): SessionTableRow[] {
  return applyCatalogFilters(rows, SESSION_FACETS, selection);
}

/**
 * The picks a narrowed-list link asks for (`?state=`, see
 * {@link sessionsListSearch}): "pinned" is the Pinned dropdown, any other
 * state that one State option.
 */
export function sessionSelectionOf(
  filter: SessionsFilter,
): CatalogFilterSelection {
  const selection: Record<string, string[]> = {};
  if (filter.state === 'pinned') {
    selection[SESSION_PINNED_FACET] = [PINNED_VALUE];
  } else if (filter.state !== 'all') {
    selection[SESSION_STATE_FACET] = [filter.state];
  }
  if (filter.agent !== undefined) {
    selection[SESSION_AGENT_FACET] = [filter.agent];
  }
  return selection;
}
