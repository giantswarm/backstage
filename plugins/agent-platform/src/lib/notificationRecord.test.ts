import {
  isPortalStarted,
  isSeen,
  levelOf,
  MAX_SESSION_SEEN_MARKS,
  mcpSignInSeenMarkOf,
  PRUNE_GRACE_MS,
  prunedSeen,
  prunedSettings,
  readNotificationSeen,
  readNotificationSettings,
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

  it(`keeps the newest ${MAX_SESSION_SEEN_MARKS} session marks`, () => {
    const many = Array.from(
      { length: MAX_SESSION_SEEN_MARKS + 5 },
      (_, index) => ({
        kind: 'session' as const,
        installation: 'gazelle',
        sessionId: `s${index}`,
        mark: `m${index}`,
      }),
    );
    let seen = noneSeen;
    many.forEach((target, index) => {
      seen = withSeen(seen, [target], NOW + index)!;
    });

    expect(Object.keys(seen.sessions)).toHaveLength(MAX_SESSION_SEEN_MARKS);
    expect(sessionSeenMarkOf(seen, 'gazelle', 's0')).toBeUndefined();
    expect(sessionSeenMarkOf(seen, 'gazelle', `s${many.length - 1}`)).toBe(
      `m${many.length - 1}`,
    );
  });
});

describe('pruning', () => {
  const longAgo = NOW - PRUNE_GRACE_MS - 1;
  const settings = readNotificationSettings({
    sessions: {
      'gazelle/live': { origin: 'portal', at: longAgo },
      'gazelle/gone': { origin: 'portal', at: longAgo },
      'gazelle/just-started': { origin: 'portal', at: NOW - 1000 },
      'golem/gone': { level: 'muted', at: longAgo },
    },
  });
  const seen = readNotificationSeen({
    sessions: {
      'gazelle/live': { mark: 'a', at: longAgo },
      'gazelle/gone': { mark: 'b', at: longAgo },
    },
    mcpSignIn: { gazelle: { mark: 'c', at: longAgo } },
  });
  const read = {
    installation: 'gazelle',
    sessionIds: ['live'],
    readAt: NOW,
  };

  it('drops the read installation’s entries for sessions it no longer lists', () => {
    expect(prunedSettings(settings, read)).toEqual({
      sessions: {
        'gazelle/live': { origin: 'portal', at: longAgo },
        // Written after the read left, perhaps: kept until a later read.
        'gazelle/just-started': { origin: 'portal', at: NOW - 1000 },
        // Another installation's: this read says nothing about it.
        'golem/gone': { level: 'muted', at: longAgo },
      },
    });
    expect(prunedSeen(seen, read)).toEqual({
      sessions: { 'gazelle/live': { mark: 'a', at: longAgo } },
      mcpSignIn: { gazelle: { mark: 'c', at: longAgo } },
    });
  });

  it('prunes nothing on an empty read', () => {
    const emptyRead = { ...read, sessionIds: [] };

    expect(prunedSettings(settings, emptyRead)).toBeUndefined();
    expect(prunedSeen(seen, emptyRead)).toBeUndefined();
  });

  it('writes nothing when nothing is gone', () => {
    const everything = {
      ...read,
      sessionIds: ['live', 'gone', 'just-started'],
    };

    expect(prunedSettings(settings, everything)).toBeUndefined();
    expect(prunedSeen(seen, everything)).toBeUndefined();
  });
});
