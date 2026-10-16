import {
  isPortalStarted,
  isSeen,
  levelOf,
  mcpSignInSeenMarkOf,
  PORTAL_STARTS_PER_INSTALLATION,
  prunedSeen,
  prunedSettings,
  readNotificationSeen,
  readNotificationSettings,
  SEEN_MARKS_PER_INSTALLATION,
  sessionSeenMarkOf,
  withLevel,
  withPortalStarted,
  withSeen,
  type NotificationLevel,
  type NotificationSeenValue,
  type NotificationSettingsValue,
} from './notificationRecord';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const EARLIER = NOW - 60 * 60 * 1000;

const empty: NotificationSettingsValue = { sessions: {} };
const noneSeen: NotificationSeenValue = { sessions: {}, mcpSignIn: {} };

describe('readNotificationSettings', () => {
  it('reads nothing stored as no entries', () => {
    expect(readNotificationSettings(undefined)).toEqual(empty);
    expect(readNotificationSettings(null)).toEqual(empty);
    expect(readNotificationSettings(['gazelle/abc'])).toEqual(empty);
  });

  it('keeps well-formed entries and drops malformed ones one by one', () => {
    expect(
      readNotificationSettings({
        sessions: {
          'gazelle/abc': { origin: 'portal', at: EARLIER },
          'gazelle/def': { level: 'muted', at: EARLIER },
          'gazelle/ghi': { origin: 'portal', level: 'all', at: EARLIER },
          // No time, unknown values, no installation, nothing to keep.
          'gazelle/no-time': { origin: 'portal' },
          'gazelle/odd': { origin: 'slack', level: 'loud', at: EARLIER },
          'no-installation': { origin: 'portal', at: EARLIER },
          'gazelle/': { origin: 'portal', at: EARLIER },
          'gazelle/text': 'portal',
        },
      }),
    ).toEqual({
      sessions: {
        'gazelle/abc': { origin: 'portal', at: EARLIER },
        'gazelle/def': { level: 'muted', at: EARLIER },
        'gazelle/ghi': { origin: 'portal', level: 'all', at: EARLIER },
      },
    });
  });
});

describe('levelOf and isPortalStarted', () => {
  const settings = readNotificationSettings({
    sessions: {
      'gazelle/portal': { origin: 'portal', at: EARLIER },
      'gazelle/portal-all': { origin: 'portal', level: 'all', at: EARLIER },
      'gazelle/slack-muted': { level: 'muted', at: EARLIER },
    },
  });

  it.each`
    sessionId        | level        | portalStarted
    ${'portal'}      | ${'default'} | ${true}
    ${'portal-all'}  | ${'all'}     | ${true}
    ${'slack-muted'} | ${'muted'}   | ${false}
    ${'no-entry'}    | ${'default'} | ${false}
  `(
    '$sessionId is at $level, portal-started: $portalStarted',
    ({ sessionId, level, portalStarted }) => {
      expect(levelOf(settings, 'gazelle', sessionId)).toBe(level);
      expect(isPortalStarted(settings, 'gazelle', sessionId)).toBe(
        portalStarted,
      );
    },
  );

  it('tells installations apart: session ids are unique only within one', () => {
    expect(levelOf(settings, 'golem', 'portal-all')).toBe('default');
    expect(isPortalStarted(settings, 'golem', 'portal')).toBe(false);
  });
});

describe('withLevel', () => {
  const portalStarted: NotificationSettingsValue = {
    sessions: { 'gazelle/abc': { origin: 'portal', at: EARLIER } },
  };

  it('mutes a session without an entry, without making it portal-started', () => {
    const next = withLevel(empty, 'gazelle', 'slack', 'muted', NOW)!;

    expect(next).toEqual({
      sessions: { 'gazelle/slack': { level: 'muted', at: NOW } },
    });
    expect(isPortalStarted(next, 'gazelle', 'slack')).toBe(false);
  });

  it('keeps the origin of a portal-started session', () => {
    expect(withLevel(portalStarted, 'gazelle', 'abc', 'all', NOW)).toEqual({
      sessions: { 'gazelle/abc': { origin: 'portal', level: 'all', at: NOW } },
    });
  });

  it('unmutes with Default, and drops an entry that held only the level', () => {
    const muted = withLevel(empty, 'gazelle', 'slack', 'muted', EARLIER)!;

    expect(withLevel(muted, 'gazelle', 'slack', 'default', NOW)).toEqual(empty);
  });

  it('keeps a portal-started session’s entry when it goes back to Default', () => {
    const all = withLevel(portalStarted, 'gazelle', 'abc', 'all', EARLIER)!;

    expect(withLevel(all, 'gazelle', 'abc', 'default', NOW)).toEqual({
      sessions: { 'gazelle/abc': { origin: 'portal', at: NOW } },
    });
  });

  it.each<NotificationLevel>(['default', 'all', 'muted'])(
    'writes nothing when the session already is at %s',
    level => {
      const settings =
        level === 'default'
          ? portalStarted
          : withLevel(portalStarted, 'gazelle', 'abc', level, EARLIER)!;
      expect(withLevel(settings, 'gazelle', 'abc', level, NOW)).toBeUndefined();
    },
  );

  it('leaves the other sessions alone', () => {
    const next = withLevel(portalStarted, 'golem', 'xyz', 'muted', NOW)!;

    expect(next.sessions['gazelle/abc']).toEqual({
      origin: 'portal',
      at: EARLIER,
    });
  });
});

describe('withPortalStarted', () => {
  it('records a new session as portal-started', () => {
    expect(withPortalStarted(empty, 'gazelle', 'abc', NOW)).toEqual({
      sessions: { 'gazelle/abc': { origin: 'portal', at: NOW } },
    });
  });

  it('keeps a level already set', () => {
    const muted = withLevel(empty, 'gazelle', 'abc', 'muted', EARLIER)!;

    expect(withPortalStarted(muted, 'gazelle', 'abc', NOW)).toEqual({
      sessions: {
        'gazelle/abc': { origin: 'portal', level: 'muted', at: NOW },
      },
    });
  });

  it('writes nothing for a session already recorded', () => {
    const started = withPortalStarted(empty, 'gazelle', 'abc', EARLIER)!;

    expect(withPortalStarted(started, 'gazelle', 'abc', NOW)).toBeUndefined();
  });
});

describe('seen marks', () => {
  it('reads nothing stored as nothing seen, and drops malformed marks', () => {
    expect(readNotificationSeen(undefined)).toEqual(noneSeen);
    expect(
      readNotificationSeen({
        sessions: {
          'gazelle/abc': { mark: 'm1', at: EARLIER },
          'gazelle/empty': { mark: '', at: EARLIER },
          'gazelle/no-time': { mark: 'm2' },
          nope: { mark: 'm3', at: EARLIER },
        },
        mcpSignIn: { gazelle: { mark: 'mcp', at: EARLIER }, golem: 'mcp' },
      }),
    ).toEqual({
      sessions: { 'gazelle/abc': { mark: 'm1', at: EARLIER } },
      mcpSignIn: { gazelle: { mark: 'mcp', at: EARLIER } },
    });
  });

  it('marks a session row and an MCP sign-in row seen', () => {
    const next = withSeen(
      noneSeen,
      [
        {
          kind: 'session',
          installation: 'gazelle',
          sessionId: 'abc',
          mark: 'waiting@1',
        },
        { kind: 'mcpSignIn', installation: 'gazelle', mark: 'kubernetes' },
      ],
      NOW,
    )!;

    expect(sessionSeenMarkOf(next, 'gazelle', 'abc')).toBe('waiting@1');
    expect(mcpSignInSeenMarkOf(next, 'gazelle')).toBe('kubernetes');
    expect(sessionSeenMarkOf(next, 'golem', 'abc')).toBeUndefined();
  });

  it('reads a row as seen only by its own mark: a new row of the session is unread', () => {
    const seen = withSeen(
      noneSeen,
      [
        {
          kind: 'session',
          installation: 'gazelle',
          sessionId: 'abc',
          mark: 'waiting@1',
        },
      ],
      NOW,
    )!;
    const row = (mark: string) => ({
      kind: 'session' as const,
      installation: 'gazelle',
      sessionId: 'abc',
      mark,
    });

    expect(isSeen(seen, row('waiting@1'))).toBe(true);
    expect(isSeen(seen, row('failed@2'))).toBe(false);
  });

  it('writes nothing when every row already carries its mark', () => {
    const target = {
      kind: 'mcpSignIn' as const,
      installation: 'gazelle',
      mark: 'kubernetes',
    };
    const seen = withSeen(noneSeen, [target], EARLIER)!;

    expect(withSeen(seen, [target], NOW)).toBeUndefined();
    expect(withSeen(seen, [], NOW)).toBeUndefined();
  });

  it(`keeps each installation’s newest ${SEEN_MARKS_PER_INSTALLATION} session marks`, () => {
    const mark = (installation: string, index: number) => ({
      kind: 'session' as const,
      installation,
      sessionId: `s${index}`,
      mark: `m${index}`,
    });
    // A quiet installation's few marks are older than the busy one's.
    let seen = withSeen(noneSeen, [mark('golem', 0), mark('golem', 1)], NOW)!;
    for (let index = 0; index < SEEN_MARKS_PER_INSTALLATION + 5; index += 1) {
      seen = withSeen(seen, [mark('gazelle', index)], NOW + 1 + index)!;
    }

    const kept = Object.keys(seen.sessions);
    expect(kept.filter(key => key.startsWith('gazelle/'))).toHaveLength(
      SEEN_MARKS_PER_INSTALLATION,
    );
    expect(sessionSeenMarkOf(seen, 'gazelle', 's0')).toBeUndefined();
    expect(sessionSeenMarkOf(seen, 'gazelle', 's44')).toBe('m44');
    // The busy installation does not push the quiet one's marks out.
    expect(sessionSeenMarkOf(seen, 'golem', 's0')).toBe('m0');
    expect(sessionSeenMarkOf(seen, 'golem', 's1')).toBe('m1');
  });
});

describe('bounding the settings', () => {
  it(`keeps each installation’s newest ${PORTAL_STARTS_PER_INSTALLATION} portal starts, and every chosen level`, () => {
    let settings = withLevel(empty, 'gazelle', 'muted-long-ago', 'muted', 0)!;
    settings = withPortalStarted(settings, 'gazelle', 'all-long-ago', 1)!;
    settings = withLevel(settings, 'gazelle', 'all-long-ago', 'all', 2)!;
    settings = withPortalStarted(settings, 'golem', 'other', 3)!;
    for (
      let index = 0;
      index < PORTAL_STARTS_PER_INSTALLATION + 3;
      index += 1
    ) {
      settings = withPortalStarted(
        settings,
        'gazelle',
        `s${index}`,
        10 + index,
      )!;
    }

    const startsOnly = Object.entries(settings.sessions).filter(
      ([key, entry]) => key.startsWith('gazelle/') && !entry.level,
    );
    expect(startsOnly).toHaveLength(PORTAL_STARTS_PER_INSTALLATION);
    expect(isPortalStarted(settings, 'gazelle', 's0')).toBe(false);
    expect(isPortalStarted(settings, 'gazelle', 's202')).toBe(true);
    // Chosen levels stay, however old.
    expect(levelOf(settings, 'gazelle', 'muted-long-ago')).toBe('muted');
    expect(levelOf(settings, 'gazelle', 'all-long-ago')).toBe('all');
    expect(isPortalStarted(settings, 'gazelle', 'all-long-ago')).toBe(true);
    expect(isPortalStarted(settings, 'golem', 'other')).toBe(true);
  });
});

describe('pruning', () => {
  const settings = readNotificationSettings({
    sessions: {
      'gazelle/live': { origin: 'portal', at: EARLIER },
      'gazelle/gone': { origin: 'portal', at: EARLIER },
      'gazelle/just-started': { origin: 'portal', at: NOW },
      'golem/gone': { level: 'muted', at: EARLIER },
    },
  });
  const seen = readNotificationSeen({
    sessions: {
      'gazelle/live': { mark: 'a', at: EARLIER },
      'gazelle/gone': { mark: 'b', at: EARLIER },
    },
    mcpSignIn: { gazelle: { mark: 'c', at: EARLIER } },
  });
  // What the record held before the read started: not `just-started`,
  // written while the read was under way.
  const known = new Set(['gazelle/live', 'gazelle/gone']);
  const read = { installation: 'gazelle', known, liveSessionIds: ['live'] };

  it('drops the known entries of sessions a complete read no longer lists', () => {
    expect(prunedSettings(settings, read)).toEqual({
      sessions: {
        'gazelle/live': { origin: 'portal', at: EARLIER },
        // Written after the read started: kept, whatever its clock says.
        'gazelle/just-started': { origin: 'portal', at: NOW },
        // Another installation's: this read says nothing about it.
        'golem/gone': { level: 'muted', at: EARLIER },
      },
    });
    expect(prunedSeen(seen, read)).toEqual({
      sessions: { 'gazelle/live': { mark: 'a', at: EARLIER } },
      mcpSignIn: { gazelle: { mark: 'c', at: EARLIER } },
    });
  });

  it('drops every known entry when the installation has no sessions left', () => {
    const none = { ...read, liveSessionIds: [] };

    expect(Object.keys(prunedSettings(settings, none)!.sessions)).toEqual([
      'gazelle/just-started',
      'golem/gone',
    ]);
  });

  it('writes nothing when nothing is gone', () => {
    const everything = { ...read, liveSessionIds: ['live', 'gone'] };

    expect(prunedSettings(settings, everything)).toBeUndefined();
    expect(prunedSeen(seen, everything)).toBeUndefined();
  });
});
