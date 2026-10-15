import {
  deriveSessionNotificationRow,
  NotificationLevel,
  SessionNotificationRowKind,
} from './sessionNotificationRow';
import { SessionStateEntry } from './kagent/kagentSessionStates';

const CHANGED_AT = Date.parse('2026-10-15T09:00:00Z');

function entry(
  state: string | null,
  extra: Partial<SessionStateEntry> = {},
): SessionStateEntry {
  return { sessionId: 's1', state, changedAt: CHANGED_AT, ...extra };
}

function kindOf(
  state: string | null,
  level: NotificationLevel | undefined,
  portalStarted: boolean,
): SessionNotificationRowKind | undefined {
  return deriveSessionNotificationRow({
    installation: 'lab',
    state: entry(state),
    level,
    portalStarted,
  })?.kind;
}

describe('deriveSessionNotificationRow', () => {
  describe('the row kind', () => {
    // [state, level, portal-started, row]
    it.each<
      [
        string | null,
        NotificationLevel | undefined,
        boolean,
        SessionNotificationRowKind | undefined,
      ]
    >([
      // Waiting: for every session of the person's, unless muted.
      ['input-required', 'default', true, 'waiting'],
      ['input-required', 'all', true, 'waiting'],
      ['input-required', 'muted', true, undefined],
      ['auth-required', 'default', true, 'waiting'],
      ['auth-required', 'all', true, 'waiting'],
      ['auth-required', 'muted', true, undefined],
      ['input-required', 'default', false, 'waiting'],
      ['input-required', 'all', false, 'waiting'],
      ['input-required', 'muted', false, undefined],
      ['auth-required', 'default', false, 'waiting'],
      // No stored level is Default.
      ['input-required', undefined, false, 'waiting'],

      // Failed: portal-started sessions only, unless muted.
      ['failed', 'default', true, 'failed'],
      ['failed', 'all', true, 'failed'],
      ['failed', 'muted', true, undefined],
      ['rejected', 'default', true, 'failed'],
      ['rejected', 'all', true, 'failed'],
      ['rejected', 'muted', true, undefined],
      ['failed', undefined, true, 'failed'],
      // Started from Slack: Failed is reported there.
      ['failed', 'default', false, undefined],
      ['failed', 'all', false, undefined],
      ['rejected', 'default', false, undefined],

      // Turn finished: portal-started sessions at All activity only.
      ['completed', 'all', true, 'turn-finished'],
      ['completed', 'default', true, undefined],
      ['completed', undefined, true, undefined],
      ['completed', 'muted', true, undefined],
      ['completed', 'all', false, undefined],
      ['completed', 'default', false, undefined],

      // canceled and unknown end states give no row at any level.
      ['canceled', 'all', true, undefined],
      ['canceled', 'default', true, undefined],
      ['canceled', 'default', false, undefined],
      ['unknown', 'all', true, undefined],
      ['something-new', 'all', true, undefined],
      ['something-new', 'default', false, undefined],

      // Working, being created or deleted, never run: no row.
      ['working', 'all', true, undefined],
      ['submitted', 'all', true, undefined],
      ['creating', 'all', true, undefined],
      ['deleting', 'all', true, undefined],
      [null, 'all', true, undefined],
    ])('%s at %s (portal-started: %s) → %s', (state, level, portal, kind) => {
      expect(kindOf(state, level, portal)).toBe(kind);
    });

    it('reads the state the way the rail does, case and v1 spelling alike', () => {
      expect(kindOf('Input-Required', 'default', false)).toBe('waiting');
      expect(kindOf('TASK_STATE_AUTH_REQUIRED', 'default', false)).toBe(
        'waiting',
      );
      expect(kindOf('TASK_STATE_FAILED', 'default', true)).toBe('failed');
    });
  });

  describe('what a row says', () => {
    it('says a waiting session waits for input or a sign-in', () => {
      expect(
        deriveSessionNotificationRow({
          installation: 'lab',
          state: entry('input-required'),
          portalStarted: false,
        }),
      ).toEqual({
        id: `lab:s1:waiting:${CHANGED_AT}`,
        installation: 'lab',
        sessionId: 's1',
        kind: 'waiting',
        changedAt: CHANGED_AT,
        waitingFor: 'input',
      });
      expect(
        deriveSessionNotificationRow({
          installation: 'lab',
          state: entry('auth-required', { authServer: 'kubernetes' }),
          portalStarted: false,
        }),
      ).toMatchObject({ waitingFor: 'sign-in', authServer: 'kubernetes' });
    });

    it('names a server only for a sign-in wait', () => {
      const row = deriveSessionNotificationRow({
        installation: 'lab',
        state: entry('input-required', { authServer: 'kubernetes' }),
        portalStarted: false,
      });

      expect(row).not.toHaveProperty('authServer');
    });

    it('gives a failed row its reason, other when the read has none', () => {
      expect(
        deriveSessionNotificationRow({
          installation: 'lab',
          state: entry('failed', { failureReason: 'model-unavailable' }),
          portalStarted: true,
        }),
      ).toMatchObject({ kind: 'failed', reason: 'model-unavailable' });
      expect(
        deriveSessionNotificationRow({
          installation: 'lab',
          state: entry('failed'),
          portalStarted: true,
        }),
      ).toMatchObject({ kind: 'failed', reason: 'other' });
    });
  });

  describe('the row identity', () => {
    function idOf(
      state: SessionStateEntry,
      installation = 'lab',
    ): string | undefined {
      return deriveSessionNotificationRow({
        installation,
        state,
        level: 'all',
        portalStarted: true,
      })?.id;
    }

    it('keeps the identity while the state is unchanged', () => {
      expect(idOf(entry('input-required'))).toBe(idOf(entry('input-required')));
    });

    it('gives a session that waits again a new identity', () => {
      expect(idOf(entry('input-required'))).not.toBe(
        idOf(entry('input-required', { changedAt: CHANGED_AT + 60_000 })),
      );
    });

    it('gives a session that fails again a new identity', () => {
      expect(idOf(entry('failed'))).not.toBe(
        idOf(entry('failed', { changedAt: CHANGED_AT + 60_000 })),
      );
    });

    it('tells the row kinds apart at the same time', () => {
      const ids = new Set(
        ['input-required', 'failed', 'completed'].map(state =>
          idOf(entry(state)),
        ),
      );
      expect(ids.size).toBe(3);
    });

    it('tells the same session id on two installations apart', () => {
      expect(idOf(entry('failed'), 'lab')).not.toBe(
        idOf(entry('failed'), 'lab-2'),
      );
    });

    it('cannot be forged by a separator inside a part', () => {
      expect(idOf({ ...entry('failed'), sessionId: 'b:c' }, 'a')).not.toBe(
        idOf({ ...entry('failed'), sessionId: 'c' }, 'a:b'),
      );
    });

    it('still has an identity when the state carries no time', () => {
      expect(idOf({ sessionId: 's1', state: 'input-required' })).toBe(
        'lab:s1:waiting:',
      );
    });

    it('does not change with what the row says', () => {
      // The reason is read again on every pass; it is not part of the identity.
      expect(idOf(entry('failed', { failureReason: 'other' }))).toBe(
        idOf(entry('failed', { failureReason: 'tool-failed' })),
      );
    });
  });
});
