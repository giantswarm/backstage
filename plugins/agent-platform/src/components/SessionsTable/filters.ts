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
import { tenantOf } from '../../lib/tenants';
import {
  SessionTableRow,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
} from './helpers';

/**
 * The State buckets. Each is named after the State cell label of most of its
 * rows; the others are close kin that the person acts on the same
 * way: auth-required under "Waiting for you" (both wait on the person),
 * submitted under "Working", rejected under "Failed", canceled under
 * "Idle" (the turn ended; the session takes the next message) — the buckets `describeSessionState`
 * names them by. "Unknown" holds unreadable
 * sessions and any state kagent reports that the portal does not recognise.
 * Rows whose state has not been loaded are a fact about this page, not the
 * session, so only "All" holds them.
 *
 * "Pinned" is not a state but rides along: a narrowed-list link may ask for
 * it, and a row is in it by its `pinned` flag whatever its state.
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

/** Every filter id a narrowed-list link may name. */
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

/**
 * The State options: the buckets, in the shell's four state words.
 * `whenPresent` ones show only while a row falls in them, because the
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
 * The organization a row's agent belongs to, as the Agents tab's
 * Organization filter names it ({@link tenantOf} the Agent CR's namespace).
 * Undefined for a row no Agent CR matched.
 */
export function sessionOrganization(row: SessionTableRow): string | undefined {
  return row.agentNamespace ? tenantOf(row.agentNamespace) : undefined;
}

/**
 * The shell list's filters (T92): the shared catalog dropdowns —
 * `CatalogFilterBar`, the idiom every Customize tab uses — over four facets.
 * State, Organization and Agent are multi-selects (picks within one widen,
 * facets narrow each other); Pinned is a dropdown of one option, drawn only
 * once something (not everything) is pinned, like the Agents tab's Favorites. Each option
 * counts what picking it would show under the search and the other picks.
 */
export const SESSION_STATE_FACET = 'state';
export const SESSION_ORGANIZATION_FACET = 'tenant';
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
    id: SESSION_ORGANIZATION_FACET,
    label: 'Organization',
    value: row => sessionOrganization(row),
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
 * list has states at all. The bar leaves out any that cannot narrow the list,
 * one organization for every session among them (`catalogFilterDimensions`).
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
