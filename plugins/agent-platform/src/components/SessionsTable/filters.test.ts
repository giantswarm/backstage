import {
  describeSessionState,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { SessionRow } from '../SessionsDataProvider/helpers';
import {
  agentKey,
  countSessionsByState,
  filterSessions,
  isSessionsFilterActive,
  SESSION_STATE_FILTERS,
  sessionAgentOptions,
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
    isError: false,
  },
);

const SRE = 'gazelle/agents/sre-agent';
const TRACKER = 'gazelle/agents/issue-tracker';

const ids = (filtered: typeof rows) => filtered.map(r => r.sessionId);

describe('SESSION_STATE_FILTERS', () => {
  it('names each chip after the State cell of its main state', () => {
    const label = (state: string) => describeSessionState(state)?.label;
    expect(SESSION_STATE_FILTERS.map(f => f.label)).toEqual([
      'All',
      label('input-required'),
      label('working'),
      label('failed'),
      label('completed'),
      'No activity yet',
      'Unknown',
    ]);
  });
});

describe('countSessionsByState', () => {
  it('counts every row once under All and once under its chip', () => {
    expect(countSessionsByState(rows, undefined)).toEqual({
      all: 11,
      waiting: 2,
      running: 1,
      failed: 1,
      finished: 2,
      idle: 1,
      unknown: 2,
    });
  });

  it('counts only the chosen agent’s rows', () => {
    expect(countSessionsByState(rows, SRE)).toEqual({
      all: 8,
      waiting: 1,
      running: 0,
      failed: 1,
      finished: 2,
      idle: 1,
      unknown: 2,
    });
  });
});

describe('filterSessions', () => {
  it('keeps every row without a filter', () => {
    expect(ids(filterSessions(rows, { state: 'all' }))).toEqual(
      rows.map(r => r.sessionId),
    );
  });

  it('keeps input and auth requests under "Waiting for input"', () => {
    expect(ids(filterSessions(rows, { state: 'waiting' }))).toEqual(['a', 'f']);
  });

  it('keeps completed and canceled sessions under "Completed"', () => {
    expect(ids(filterSessions(rows, { state: 'finished' }))).toEqual([
      'c',
      'i',
    ]);
  });

  it('reaches idle and unreadable sessions through their chips', () => {
    expect(ids(filterSessions(rows, { state: 'idle' }))).toEqual(['h']);
    expect(ids(filterSessions(rows, { state: 'unknown' }))).toEqual(['j', 'k']);
  });

  it('puts a state the portal does not recognise under "Unknown"', () => {
    const [odd] = withSessionStates([row('z', 'SRE Agent', sre)], {
      states: new Map([['gazelle/z', { sessionId: 'z', state: 'paused' }]]),
      unreadable: new Set(),
      failedInstallations: new Set(),
      skippedCount: 0,
      isLoading: false,
      isError: false,
    });

    expect(odd.stateCell).toMatchObject({ state: { label: 'paused' } });
    expect(ids(filterSessions([odd], { state: 'unknown' }))).toEqual(['z']);
    expect(countSessionsByState([odd], undefined)).toMatchObject({
      all: 1,
      finished: 0,
      unknown: 1,
    });
  });

  it('leaves a row with no loaded state to "All"', () => {
    const buckets = SESSION_STATE_FILTERS.filter(f => f.id !== 'all');
    expect(
      buckets.flatMap(f => ids(filterSessions(rows, { state: f.id }))),
    ).not.toContain('e');
  });

  it('combines the state and the agent', () => {
    expect(ids(filterSessions(rows, { state: 'waiting', agent: SRE }))).toEqual(
      ['f'],
    );
    expect(ids(filterSessions(rows, { state: 'all', agent: TRACKER }))).toEqual(
      ['a', 'b'],
    );
  });
});

describe('isSessionsFilterActive', () => {
  it('is off only for all states and all agents', () => {
    expect(isSessionsFilterActive({ state: 'all' })).toBe(false);
    expect(isSessionsFilterActive({ state: 'failed' })).toBe(true);
    expect(isSessionsFilterActive({ state: 'all', agent: SRE })).toBe(true);
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
      ['finished', 'Finished'],
      ['failed', 'Failed'],
    ]);
    expect(SHELL_SESSION_STATE_FILTERS.map(({ id }) => id).sort()).toEqual(
      SESSION_STATE_FILTERS.map(({ id }) => id).sort(),
    );
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
      isError: false,
    });
    const chip = SHELL_SESSION_STATE_FILTERS.find(
      ({ label }) => label === describeSessionState(state)?.shellLabel,
    );
    if (!chip) {
      throw new Error(`no chip is named for ${state}`);
    }
    expect(filterSessions([stateRow], { state: chip.id })).toEqual([stateRow]);
  });
});
