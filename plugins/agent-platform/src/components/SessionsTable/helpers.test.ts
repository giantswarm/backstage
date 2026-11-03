import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { SessionRow } from '../SessionsDataProvider/helpers';
import {
  formatSessionTime,
  sessionDayGroup,
  withSessionStates,
} from './helpers';

function row(id: string, overrides: Partial<SessionRow> = {}): SessionRow {
  const [installation, sessionId] = id.split('/');
  return {
    id,
    sessionId,
    installation,
    title: sessionId,
    agentName: 'Issue tracker',
    ...overrides,
  };
}

function view(
  overrides: Partial<FleetSessionStatesView> = {},
): FleetSessionStatesView {
  return {
    states: new Map<string, SessionStateEntry>(),
    unreadable: new Set<string>(),
    failedInstallations: new Set<string>(),
    skippedCount: 0,
    isLoading: false,
    isComplete: true,
    isError: false,
    ...overrides,
  };
}

describe('withSessionStates', () => {
  it('joins on the row id, so one session id on two installations does not collide', () => {
    const states = new Map<string, SessionStateEntry>([
      ['gazelle/abc', { sessionId: 'abc', state: 'working' }],
      ['golem/abc', { sessionId: 'abc', state: 'completed' }],
    ]);

    const joined = withSessionStates(
      [row('gazelle/abc'), row('golem/abc')],
      view({ states }),
    );

    expect(joined[0].stateCell).toMatchObject({
      kind: 'state',
      state: { key: 'working' },
    });
    expect(joined[1].stateCell).toMatchObject({
      kind: 'state',
      state: { key: 'completed' },
    });
  });

  it('reports a session that reported no state as idle, not as unknown', () => {
    // Created and never run. A real condition, and not the same as a read that
    // failed.
    const states = new Map<string, SessionStateEntry>([
      ['gazelle/abc', { sessionId: 'abc', state: null }],
    ]);

    const [joined] = withSessionStates([row('gazelle/abc')], view({ states }));

    expect(joined.stateCell).toEqual({ kind: 'idle' });
  });

  it('reports a session the backend could not read as unknown', () => {
    const [joined] = withSessionStates(
      [row('gazelle/abc')],
      view({ unreadable: new Set(['gazelle/abc']) }),
    );

    expect(joined.stateCell).toEqual({ kind: 'unreadable' });
  });

  it('reports every row of an installation whose summary failed as unknown', () => {
    const joined = withSessionStates(
      [row('gazelle/abc'), row('golem/def')],
      view({ failedInstallations: new Set(['gazelle']) }),
    );

    expect(joined[0].stateCell).toEqual({ kind: 'unreadable' });
    expect(joined[1].stateCell).toEqual({ kind: 'unevaluated' });
  });

  it('prefers a state that did arrive over an earlier failure of the same session', () => {
    const states = new Map<string, SessionStateEntry>([
      ['gazelle/abc', { sessionId: 'abc', state: 'input-required' }],
    ]);

    const [joined] = withSessionStates(
      [row('gazelle/abc')],
      view({ states, unreadable: new Set(['gazelle/abc']) }),
    );

    expect(joined.stateCell).toMatchObject({ kind: 'state' });
  });

  it('reports every row as unevaluated when no summary is given at all', () => {
    const [joined] = withSessionStates([row('gazelle/abc')], undefined);

    expect(joined.stateCell).toEqual({ kind: 'unevaluated' });
  });

  it('keeps an unrecognised state visible rather than dropping it', () => {
    const states = new Map<string, SessionStateEntry>([
      ['gazelle/abc', { sessionId: 'abc', state: 'quantum' }],
    ]);

    const [joined] = withSessionStates([row('gazelle/abc')], view({ states }));

    expect(joined.stateCell).toMatchObject({
      kind: 'state',
      state: { label: 'quantum', isActive: false },
    });
  });
});

describe('withSessionStates, last activity', () => {
  it('joins when each session was last active: its start or its newest state change', () => {
    const started = '2026-09-01T00:00:00Z';
    const joined = withSessionStates(
      [
        row('gazelle/moved', { createdAt: started }),
        row('gazelle/still', { createdAt: started }),
      ],
      view({
        states: new Map<string, SessionStateEntry>([
          [
            'gazelle/moved',
            { sessionId: 'moved', state: 'completed', changedAt: 2e12 },
          ],
        ]),
      }),
    );

    expect(joined.map(r => r.lastActiveAt)).toEqual([
      2e12,
      Date.parse(started),
    ]);
  });
});

describe('sessionDayGroup', () => {
  const now = new Date(2026, 9, 9, 10, 30);

  it.each([
    ['earlier today', new Date(2026, 9, 9, 0, 0), 'today'],
    ['later than now', new Date(2026, 9, 9, 11, 0), 'today'],
    ['the previous day', new Date(2026, 9, 8, 23, 59), 'yesterday'],
    ['the previous day at midnight', new Date(2026, 9, 8, 0, 0), 'yesterday'],
    ['two days ago', new Date(2026, 9, 7, 23, 59), 'earlier'],
  ])('groups a last activity %s', (_, activeAt, group) => {
    expect(sessionDayGroup(activeAt.getTime(), now)).toBe(group);
  });

  it('counts the last day of the previous month as yesterday', () => {
    const firstOfMonth = new Date(2026, 9, 1, 8, 0);
    expect(
      sessionDayGroup(new Date(2026, 8, 30, 20, 0).getTime(), firstOfMonth),
    ).toBe('yesterday');
  });

  it.each([undefined, Number.NaN])(
    'puts an unknown time (%p) under earlier',
    activeAt => {
      expect(sessionDayGroup(activeAt, now)).toBe('earlier');
    },
  );
});

describe('formatSessionTime', () => {
  const started = new Date(2026, 9, 2, 9, 5).getTime();

  it('shows the time of day under today and yesterday', () => {
    const time = new Date(started).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(formatSessionTime(started, 'today', 2026)).toBe(time);
    expect(formatSessionTime(started, 'yesterday', 2026)).toBe(time);
  });

  it('shows the date under earlier, with the year only when it is another', () => {
    expect(formatSessionTime(started, 'earlier', 2026)).not.toContain('2026');
    expect(formatSessionTime(started, 'earlier', 2027)).toContain('2026');
  });
});
