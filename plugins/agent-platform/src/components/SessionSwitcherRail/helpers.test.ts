import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { SessionRow } from '../SessionsDataProvider/helpers';
import {
  countSessions,
  groupActiveSessions,
  RECENTLY_FINISHED_GRACE_MS,
  withCurrentSessionState,
} from './helpers';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function row(sessionId: string): SessionRow {
  return {
    id: `gazelle/${sessionId}`,
    sessionId,
    installation: 'gazelle',
    title: `session ${sessionId}`,
    agentName: 'SRE agent',
  };
}

function statesOf(
  entries: Array<[string, string | null, number?]>,
): Map<string, SessionStateEntry> {
  return new Map(
    entries.map(([sessionId, state, changedAt]) => [
      sessionId,
      { sessionId, state, ...(changedAt === undefined ? {} : { changedAt }) },
    ]),
  );
}

describe('groupActiveSessions', () => {
  it('splits the awaiting states into Waiting and the rest into Running', () => {
    const groups = groupActiveSessions(
      ['a', 'b', 'c', 'd'].map(row),
      statesOf([
        ['a', 'input-required'],
        ['b', 'working'],
        ['c', 'auth-required'],
        ['d', 'submitted'],
      ]),
      NOW,
    );

    expect(groups.map(g => g.key)).toEqual(['waiting', 'running']);
    expect(groups[0].sessions.map(s => s.row.sessionId).sort()).toEqual([
      'a',
      'c',
    ]);
    expect(groups[1].sessions.map(s => s.row.sessionId).sort()).toEqual([
      'b',
      'd',
    ]);
  });

  it.each([['completed'], ['failed'], ['canceled'], ['rejected']])(
    'excludes a %s session',
    state => {
      expect(
        groupActiveSessions([row('a')], statesOf([['a', state]]), NOW),
      ).toEqual([]);
    },
  );

  it('excludes a session whose state is unrecognised', () => {
    // Same call describeSessionState makes: we cannot promise a session is live
    // on the strength of a word we do not know.
    expect(
      groupActiveSessions([row('a')], statesOf([['a', 'quantum-flux']]), NOW),
    ).toEqual([]);
  });

  it('excludes a session that has never run', () => {
    // `null` means it has tasks but none reported a state. "No activity yet" is
    // not "non-terminal".
    expect(
      groupActiveSessions([row('a')], statesOf([['a', null]]), NOW),
    ).toEqual([]);
  });

  it('excludes a session the summary never evaluated', () => {
    expect(groupActiveSessions([row('a')], new Map(), NOW)).toEqual([]);
  });

  it('keeps a session that has been working for three days', () => {
    // The rail deliberately does not apply ACTIVE_MAX_AGE_MS. That bound exists
    // so the composer's "Working…" indicator stops claiming progress after an
    // agent dies mid-turn; a rail that hid the session would be silent in
    // exactly the case someone opened it for.
    const groups = groupActiveSessions(
      [row('stuck')],
      statesOf([['stuck', 'working', NOW - 3 * DAY]]),
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('running');
    expect(groups[0].sessions[0].row.sessionId).toBe('stuck');
  });

  it('sorts Waiting longest-blocked first', () => {
    const groups = groupActiveSessions(
      ['fresh', 'ancient', 'middling'].map(row),
      statesOf([
        ['fresh', 'input-required', NOW - 2 * MINUTE],
        ['ancient', 'input-required', NOW - 2 * DAY],
        ['middling', 'input-required', NOW - 3 * 60 * MINUTE],
      ]),
      NOW,
    );

    expect(groups[0].sessions.map(s => s.row.sessionId)).toEqual([
      'ancient',
      'middling',
      'fresh',
    ]);
  });

  it('sorts Running most-recently-active first', () => {
    const groups = groupActiveSessions(
      ['stale', 'fresh', 'middling'].map(row),
      statesOf([
        ['stale', 'working', NOW - 2 * DAY],
        ['fresh', 'working', NOW - 2 * MINUTE],
        ['middling', 'working', NOW - 3 * 60 * MINUTE],
      ]),
      NOW,
    );

    expect(groups[0].sessions.map(s => s.row.sessionId)).toEqual([
      'fresh',
      'middling',
      'stale',
    ]);
  });

  it.each([
    ['waiting', 'input-required'],
    ['running', 'working'],
  ])('sorts an unknown changedAt last in the %s group', (_label, state) => {
    // Last in *either* direction, matching sortSessionRows. Sorting it first
    // among the longest-blocked would put "we don't know" in the one position
    // that actively misleads.
    const groups = groupActiveSessions(
      ['unknown', 'known'].map(row),
      statesOf([
        ['unknown', state],
        ['known', state, NOW - DAY],
      ]),
      NOW,
    );

    expect(groups[0].sessions.map(s => s.row.sessionId)).toEqual([
      'known',
      'unknown',
    ]);
  });

  it('omits a group with no sessions rather than showing an empty heading', () => {
    const groups = groupActiveSessions(
      [row('a')],
      statesOf([['a', 'working']]),
      NOW,
    );

    expect(groups.map(g => g.key)).toEqual(['running']);
  });

  it('carries changedAt through for the card to age', () => {
    const groups = groupActiveSessions(
      [row('a')],
      statesOf([['a', 'input-required', NOW - 16 * MINUTE]]),
      NOW,
    );

    expect(groups[0].sessions[0].changedAt).toBe(NOW - 16 * MINUTE);
  });

  it('labels and tones each group', () => {
    const groups = groupActiveSessions(
      ['a', 'b'].map(row),
      statesOf([
        ['a', 'input-required'],
        ['b', 'working'],
      ]),
      NOW,
    );

    expect(groups).toEqual([
      expect.objectContaining({ label: 'Waiting', tone: 'warning' }),
      expect.objectContaining({ label: 'Running', tone: 'info' }),
    ]);
  });
});

describe('groupActiveSessions — the grace window for finished sessions', () => {
  it('keeps a just-finished session in its own group', () => {
    // Without this the session vanishes the instant its turn completes, which
    // is the moment it is most worth reaching: the reply just landed.
    const groups = groupActiveSessions(
      [row('done')],
      statesOf([['done', 'completed', NOW - 2 * MINUTE]]),
      NOW,
    );

    expect(groups.map(g => g.key)).toEqual(['recent']);
    expect(groups[0].label).toBe('Recently finished');
    expect(groups[0].tone).toBe('neutral');
    expect(groups[0].sessions[0].row.sessionId).toBe('done');
  });

  it.each([['completed'], ['failed'], ['canceled'], ['rejected']])(
    'graces a %s session too',
    state => {
      const groups = groupActiveSessions(
        [row('a')],
        statesOf([['a', state, NOW - MINUTE]]),
        NOW,
      );

      expect(groups.map(g => g.key)).toEqual(['recent']);
    },
  );

  it('drops it once the grace window has passed', () => {
    const groups = groupActiveSessions(
      [row('old')],
      statesOf([['old', 'completed', NOW - RECENTLY_FINISHED_GRACE_MS - 1]]),
      NOW,
    );

    expect(groups).toEqual([]);
  });

  it('drops a finished session whose changedAt is unknown', () => {
    // It cannot be placed in time at all, so it would otherwise linger for ever.
    // Same "unknown is not zero" rule the age formatter keeps.
    const groups = groupActiveSessions(
      [row('undated')],
      statesOf([['undated', 'completed']]),
      NOW,
    );

    expect(groups).toEqual([]);
  });

  it('orders the group most-recently-finished first', () => {
    const groups = groupActiveSessions(
      ['older', 'newer'].map(row),
      statesOf([
        ['older', 'completed', NOW - 10 * MINUTE],
        ['newer', 'completed', NOW - MINUTE],
      ]),
      NOW,
    );

    expect(groups[0].sessions.map(s => s.row.sessionId)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('sorts the groups Waiting, Running, then Recently finished', () => {
    const groups = groupActiveSessions(
      ['w', 'r', 'd'].map(row),
      statesOf([
        ['w', 'input-required', NOW - MINUTE],
        ['r', 'working', NOW - MINUTE],
        ['d', 'completed', NOW - MINUTE],
      ]),
      NOW,
    );

    expect(groups.map(g => g.key)).toEqual(['waiting', 'running', 'recent']);
  });

  it('does not count a graced session as non-terminal', () => {
    // The header says "N non-terminal", and these are terminal. Counting them
    // would make the number contradict the word.
    const groups = groupActiveSessions(
      ['w', 'd'].map(row),
      statesOf([
        ['w', 'input-required', NOW - MINUTE],
        ['d', 'completed', NOW - MINUTE],
      ]),
      NOW,
    );

    expect(groups.map(g => g.key)).toEqual(['waiting', 'recent']);
    expect(countSessions(groups)).toBe(1);
  });
});

describe('countSessions', () => {
  it('totals across groups', () => {
    const groups = groupActiveSessions(
      ['a', 'b', 'c'].map(row),
      statesOf([
        ['a', 'input-required'],
        ['b', 'working'],
        ['c', 'submitted'],
      ]),
      NOW,
    );

    expect(countSessions(groups)).toBe(3);
  });

  it('is zero when nothing is active', () => {
    expect(countSessions([])).toBe(0);
  });
});

describe('withCurrentSessionState', () => {
  const summary = statesOf([
    ['viewed', 'completed', NOW - 30 * 1000],
    ['other', 'working', NOW - MINUTE],
  ]);

  it('returns the same map when there is nothing to overlay', () => {
    // Identity matters: a fresh map every render would invalidate the grouping
    // memo downstream on every tick.
    expect(withCurrentSessionState(summary, undefined)).toBe(summary);
  });

  it('replaces only the entry for the session being viewed', () => {
    const merged = withCurrentSessionState(summary, {
      sessionId: 'viewed',
      state: 'working',
      changedAt: NOW,
    });

    expect(merged.get('viewed')).toEqual({
      sessionId: 'viewed',
      state: 'working',
      changedAt: NOW,
    });
    expect(merged.get('other')).toBe(summary.get('other'));
    expect(summary.get('viewed')?.state).toBe('completed');
  });

  it('adds an entry the summary never evaluated', () => {
    const merged = withCurrentSessionState(new Map(), {
      sessionId: 'fresh',
      state: 'working',
      changedAt: NOW,
    });

    expect(merged.get('fresh')?.state).toBe('working');
  });

  it('moves a just-continued session out of Recently finished and into Running', () => {
    // The reported bug: appending a message to a finished session left it filed
    // as finished, because the backend summary is cached for 15s and the page
    // never got a say about its own session.
    const rows = [row('viewed'), row('other')];

    const beforeOverride = groupActiveSessions(rows, summary, NOW);
    expect(beforeOverride.map(g => g.key)).toEqual(['running', 'recent']);
    expect(
      beforeOverride.find(g => g.key === 'recent')?.sessions[0].row.sessionId,
    ).toBe('viewed');

    const afterOverride = groupActiveSessions(
      rows,
      withCurrentSessionState(summary, {
        sessionId: 'viewed',
        state: 'working',
        changedAt: NOW,
      }),
      NOW,
    );

    expect(afterOverride.map(g => g.key)).toEqual(['running']);
    expect(afterOverride[0].sessions.map(s => s.row.sessionId).sort()).toEqual([
      'other',
      'viewed',
    ]);
    expect(countSessions(afterOverride)).toBe(2);
  });
});
