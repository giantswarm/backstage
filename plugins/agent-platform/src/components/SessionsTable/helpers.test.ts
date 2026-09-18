import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { SessionRow } from '../SessionsDataProvider/helpers';
import {
  SessionTableRow,
  sortSessionsByState,
  STATE_RANKS,
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
    // An unrecognised state is not claimed to be running, so it ranks with the
    // finished ones rather than at the top of the list.
    expect(joined.stateRank).toBe(STATE_RANKS.finished);
  });

  it.each([
    ['input-required', STATE_RANKS.waiting],
    ['auth-required', STATE_RANKS.waiting],
    ['working', STATE_RANKS.running],
    ['submitted', STATE_RANKS.running],
    ['failed', STATE_RANKS.failed],
    ['rejected', STATE_RANKS.failed],
    ['completed', STATE_RANKS.finished],
    ['canceled', STATE_RANKS.finished],
  ])('ranks %s for the State column', (state, rank) => {
    const states = new Map<string, SessionStateEntry>([
      ['gazelle/abc', { sessionId: 'abc', state }],
    ]);

    const [joined] = withSessionStates([row('gazelle/abc')], view({ states }));

    expect(joined.stateRank).toBe(rank);
  });
});

describe('sortSessionsByState', () => {
  const states = new Map<string, SessionStateEntry>([
    ['gazelle/done', { sessionId: 'done', state: 'completed', changedAt: 40 }],
    [
      'gazelle/waiting-old',
      { sessionId: 'waiting-old', state: 'input-required', changedAt: 10 },
    ],
    [
      'gazelle/waiting-new',
      { sessionId: 'waiting-new', state: 'input-required', changedAt: 30 },
    ],
    [
      'gazelle/running',
      { sessionId: 'running', state: 'working', changedAt: 20 },
    ],
  ]);

  const rows: SessionTableRow[] = withSessionStates(
    [
      row('gazelle/done'),
      row('gazelle/waiting-old'),
      row('gazelle/running'),
      row('gazelle/waiting-new'),
      row('gazelle/never'),
    ],
    view({ states }),
  );

  it('puts what needs a person first, ascending', () => {
    expect(
      sortSessionsByState(rows, 'ascending').map(r => r.sessionId),
    ).toEqual(['waiting-new', 'waiting-old', 'running', 'done', 'never']);
  });

  it('reverses in the other direction', () => {
    expect(
      sortSessionsByState(rows, 'descending').map(r => r.sessionId),
    ).toEqual(['never', 'done', 'running', 'waiting-new', 'waiting-old']);
  });

  it('does not mutate the rows it is given', () => {
    const order = rows.map(r => r.sessionId);
    sortSessionsByState(rows, 'ascending');
    expect(rows.map(r => r.sessionId)).toEqual(order);
  });

  it('falls back to last activity when no state says when it moved', () => {
    const undated = withSessionStates(
      [
        row('gazelle/older', { updatedAt: '2026-09-01T00:00:00Z' }),
        row('gazelle/newer', { updatedAt: '2026-09-08T00:00:00Z' }),
      ],
      view(),
    );

    expect(
      sortSessionsByState(undated, 'ascending').map(r => r.sessionId),
    ).toEqual(['newer', 'older']);
  });
});
