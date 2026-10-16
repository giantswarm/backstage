import {
  describeSessionState,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { SessionRow } from '../SessionsDataProvider/helpers';
import {
  agentKey,
  filterSessionsBySelection,
  sessionAgentOptions,
  sessionFacets,
  sessionSelectionOf,
  SessionStateFilter,
  SHELL_SESSION_STATE_FILTERS,
} from './filters';
import { withSessionStates } from './helpers';

function row(
  id: string,
  agentName: string,
  agent?: { namespace: string; name: string; installation?: string },
): SessionRow {
  const installation = agent?.installation ?? 'gazelle';
  return {
    id: `${installation}/${id}`,
    sessionId: id,
    installation,
    title: id,
    agentName,
    ...(agent
      ? { agentNamespace: agent.namespace, agentTechnicalName: agent.name }
      : {}),
  };
}

const tracker = { namespace: 'agents', name: 'issue-tracker' };
const sre = { namespace: 'agents', name: 'sre-agent' };

const states = new Map<string, SessionStateEntry>([
  ['gazelle/a', { sessionId: 'a', state: 'input-required' }],
  ['gazelle/b', { sessionId: 'b', state: 'working' }],
  ['gazelle/c', { sessionId: 'c', state: 'completed' }],
  ['gazelle/d', { sessionId: 'd', state: 'failed' }],
  ['gazelle/f', { sessionId: 'f', state: 'auth-required' }],
  ['gazelle/h', { sessionId: 'h', state: null }],
  ['gazelle/i', { sessionId: 'i', state: 'canceled' }],
  ['gazelle/j', { sessionId: 'j', state: 'unknown' }],
]);

const rows = withSessionStates(
  [
    row('a', 'Issue tracker', tracker),
    row('b', 'Issue tracker', tracker),
    row('c', 'SRE Agent', sre),
    row('d', 'SRE Agent', sre),
    row('e', 'SRE Agent', sre),
    row('f', 'SRE Agent', sre),
    row('g', ''),
    row('h', 'SRE Agent', sre),
    row('i', 'SRE Agent', sre),
    row('j', 'SRE Agent', sre),
    row('k', 'SRE Agent', sre),
  ],
  {
    states,
    unreadable: new Set(['gazelle/k']),
    failedInstallations: new Set(),
    skippedCount: 0,
    isLoading: false,
    isComplete: true,
    isError: false,
  },
);

const SRE = 'gazelle/agents/sre-agent';
const TRACKER = 'gazelle/agents/issue-tracker';

const ids = (filtered: typeof rows) => filtered.map(r => r.sessionId);

/** The rows one State (or Pinned) pick keeps, as a narrowed-list link opens. */
const byState = (rs: typeof rows, state: SessionStateFilter, agent?: string) =>
  filterSessionsBySelection(
    rs,
    sessionSelectionOf(agent ? { state, agent } : { state }),
  );

describe('the State buckets', () => {
  it('keeps every row without a filter', () => {
    expect(ids(byState(rows, 'all'))).toEqual(rows.map(r => r.sessionId));
  });

  it('keeps input and auth requests under "Waiting for you"', () => {
    expect(ids(byState(rows, 'waiting'))).toEqual(['a', 'f']);
  });

  it('keeps completed and canceled sessions under "Idle"', () => {
    expect(ids(byState(rows, 'finished'))).toEqual(['c', 'i']);
  });

  it('reaches idle and unreadable sessions through their chips', () => {
    expect(ids(byState(rows, 'idle'))).toEqual(['h']);
    expect(ids(byState(rows, 'unknown'))).toEqual(['j', 'k']);
  });

  it('puts a state the portal does not recognise under "Unknown"', () => {
    const [odd] = withSessionStates([row('z', 'SRE Agent', sre)], {
      states: new Map([['gazelle/z', { sessionId: 'z', state: 'paused' }]]),
      unreadable: new Set(),
      failedInstallations: new Set(),
      skippedCount: 0,
      isLoading: false,
      isComplete: true,
      isError: false,
    });

    expect(odd.stateCell).toMatchObject({ state: { label: 'paused' } });
    expect(ids(byState([odd], 'unknown'))).toEqual(['z']);
    expect(ids(byState([odd], 'finished'))).toEqual([]);
  });

  it('leaves a row with no loaded state to "All"', () => {
    const buckets = SHELL_SESSION_STATE_FILTERS.filter(
      f => f.id !== 'all' && f.id !== 'pinned',
    );
    expect(buckets.flatMap(f => ids(byState(rows, f.id)))).not.toContain('e');
  });

  it('combines the state and the agent', () => {
    expect(ids(byState(rows, 'waiting', SRE))).toEqual(['f']);
    expect(ids(byState(rows, 'all', TRACKER))).toEqual(['a', 'b']);
  });
});

describe('agentKey', () => {
  it('is the installation, namespace and name of the matched agent', () => {
    expect(agentKey(rows[0])).toBe(TRACKER);
  });

  it('falls back to the installation and display name without a match', () => {
    const [unmatched] = withSessionStates([row('x', 'Old agent')], undefined);
    expect(agentKey(unmatched)).toBe('gazelle//Old agent');
  });

  it('is undefined for a row with no agent at all', () => {
    expect(agentKey(rows[6])).toBeUndefined();
  });
});

describe('sessionAgentOptions', () => {
  it('lists each agent once, alphabetically', () => {
    expect(sessionAgentOptions(rows)).toEqual([
      { id: TRACKER, label: 'Issue tracker' },
      { id: SRE, label: 'SRE Agent' },
    ]);
  });

  it('tells namesakes apart by installation, then namespace', () => {
    const namesakes = withSessionStates(
      [
        row('a', 'SRE Agent', sre),
        row('b', 'SRE Agent', { ...sre, installation: 'glean' }),
        row('c', 'SRE Agent', { namespace: 'team-a', name: 'sre-agent' }),
      ],
      undefined,
    );
    expect(sessionAgentOptions(namesakes)).toEqual([
      { id: SRE, label: 'SRE Agent (gazelle/agents)' },
      { id: 'gazelle/team-a/sre-agent', label: 'SRE Agent (gazelle/team-a)' },
      { id: 'glean/agents/sre-agent', label: 'SRE Agent (glean)' },
    ]);
  });
});

describe('SHELL_SESSION_STATE_FILTERS', () => {
  it('names the chips in the shell words, over the same buckets', () => {
    expect(
      SHELL_SESSION_STATE_FILTERS.filter(({ whenPresent }) => !whenPresent).map(
        ({ id, label }) => [id, label],
      ),
    ).toEqual([
      ['all', 'All'],
      ['waiting', 'Waiting for you'],
      ['running', 'Working'],
      ['finished', 'Idle'],
      ['failed', 'Failed'],
    ]);
    expect(SHELL_SESSION_STATE_FILTERS.map(({ id }) => id).sort()).toEqual(
      [
        'all',
        'failed',
        'finished',
        'idle',
        'pinned',
        'running',
        'unknown',
        'waiting',
      ].sort(),
    );
  });

  it('keeps only the pinned rows under the Pinned chip', () => {
    const pinnedRows = rows.map(r =>
      ['b', 'd'].includes(r.sessionId) ? { ...r, pinned: true } : r,
    );
    expect(ids(byState(pinnedRows, 'pinned'))).toEqual(['b', 'd']);
  });

  it.each([
    'input-required',
    'auth-required',
    'submitted',
    'working',
    'completed',
    'canceled',
    'failed',
    'rejected',
  ])('files %s under the chip its shell label names', state => {
    const [stateRow] = withSessionStates([row('s', 'SRE Agent', sre)], {
      states: new Map([['gazelle/s', { sessionId: 's', state }]]),
      unreadable: new Set(),
      failedInstallations: new Set(),
      skippedCount: 0,
      isLoading: false,
      isComplete: true,
      isError: false,
    });
    const chip = SHELL_SESSION_STATE_FILTERS.find(
      ({ label }) => label === describeSessionState(state)?.label,
    );
    if (!chip) {
      throw new Error(`no chip is named for ${state}`);
    }
    expect(byState([stateRow], chip.id)).toEqual([stateRow]);
  });
});

describe('the shell list’s dropdown filters (T92)', () => {
  it('widens within a facet and narrows across facets', () => {
    expect(
      ids(filterSessionsBySelection(rows, { state: ['waiting', 'running'] })),
    ).toEqual(['a', 'b', 'f']);
    expect(
      ids(
        filterSessionsBySelection(rows, {
          state: ['waiting', 'running'],
          agent: [agentKey(rows[0])!],
        }),
      ),
    ).toEqual(['a', 'b']);
  });

  it('keeps rows whose state is not loaded only while State is unfiltered', () => {
    expect(ids(filterSessionsBySelection(rows, {}))).toContain('e');
    expect(
      ids(filterSessionsBySelection(rows, { state: ['finished'] })),
    ).not.toContain('e');
  });

  it('opens on what a narrowed-list link asks for', () => {
    expect(sessionSelectionOf({ state: 'all' })).toEqual({});
    expect(sessionSelectionOf({ state: 'waiting' })).toEqual({
      state: ['waiting'],
    });
    expect(sessionSelectionOf({ state: 'pinned' })).toEqual({
      pinned: ['pinned'],
    });
  });

  it('names states in the shell words and agents as the picker did', () => {
    const facets = sessionFacets(rows, { showStates: true });
    expect(facets.map(facet => facet.id)).toEqual(['state', 'agent', 'pinned']);
    expect(facets[0].optionLabel?.('waiting')).toBe('Waiting for you');
    expect(facets[1].optionLabel?.(agentKey(rows[0])!)).toBe('Issue tracker');
    expect(
      sessionFacets(rows, { showStates: false }).map(facet => facet.id),
    ).toEqual(['agent', 'pinned']);
  });
});
