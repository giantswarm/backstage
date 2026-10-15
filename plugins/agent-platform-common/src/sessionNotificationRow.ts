import { SessionFailureReason } from './kagent/kagentFailureReason';
import {
  AWAITING_INPUT_STATES,
  describeSessionState,
  FAILED_STATES,
} from './kagent/kagentSessionState';
import { SessionStateEntry } from './kagent/kagentSessionStates';

/**
 * How much a person wants to hear about one session: **Default** (Waiting and
 * Failed), **All activity** (adds Turn finished) or **Muted** (nothing). A
 * session with no stored level is at `default`.
 */
export const NOTIFICATION_LEVELS = ['default', 'all', 'muted'] as const;

export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

/** The kinds of row a session can have in the Notification inbox. */
export type SessionNotificationRowKind = 'waiting' | 'failed' | 'turn-finished';

/**
 * What makes a row the same row: the installation, the session, the row kind
 * and when the session's state last changed. The session-state read carries
 * no turn id, so the time stands in for the turn: a session that waits or fails
 * again is a new row, and reading an unchanged state again is the same one.
 */
export type SessionNotificationRowIdentity = {
  installation: string;
  sessionId: string;
  kind: SessionNotificationRowKind;
  /**
   * Epoch ms the state last changed; absent when nothing in the conversation
   * says. Rows without it cannot tell two waits of the same kind apart.
   */
  changedAt?: number;
};

/** The row one session has now. */
export type SessionNotificationRow = SessionNotificationRowIdentity & {
  /**
   * The identity as one opaque string: the seen mark to store, the
   * desktop notification's `tag`, a React key. Compare it whole; do not parse
   * it.
   */
  id: string;
} & (
    | {
        kind: 'waiting';
        /** `input`: a question or a confirmation; `sign-in`: `auth-required`. */
        waitingFor: 'input' | 'sign-in';
        /** The server a `sign-in` wait is for, when the read names one. */
        authServer?: string;
      }
    | {
        kind: 'failed';
        /** Why, as a short class; `other` when the read gives none. */
        reason: SessionFailureReason;
      }
    | { kind: 'turn-finished' }
  );

export type SessionNotificationRowInput = {
  installation: string;
  /** The session's entry from the `session-states` read. */
  state: SessionStateEntry;
  /** The session's Notification level; `default` when absent. */
  level?: NotificationLevel;
  /**
   * Whether the session was started in the portal. Sessions started anywhere
   * else (Slack, before the record existed) report only Waiting: their other
   * outcomes are reported where they were started.
   */
  portalStarted: boolean;
};

/** The identity as the opaque string {@link SessionNotificationRow.id}. */
export function sessionNotificationRowId(
  identity: SessionNotificationRowIdentity,
): string {
  return [
    identity.installation,
    identity.sessionId,
    identity.kind,
    identity.changedAt === undefined ? '' : String(identity.changedAt),
  ]
    .map(encodeURIComponent)
    .join(':');
}

/**
 * The row rule: the row one session has now, if any. The single place the
 * rules live.
 *
 * - Muted: no row.
 * - Waiting (`input-required`, `auth-required`): a Waiting row, for any
 *   session of the person's, wherever it was started.
 * - Failed (`failed`, `rejected`, or a failed instance): a Failed row, for a
 *   portal-started session.
 * - Turn finished (`completed`): a Turn finished row, for a portal-started
 *   session at All activity.
 * - Anything else — working, `canceled`, an unknown state, never run: no row.
 *
 * The state is read with the same parser and state sets the rail uses, so the
 * rail and the inbox cannot disagree about what Waiting means. Whether the
 * person has seen the row, and whether its session is on screen, are the
 * inbox's to decide.
 */
export function deriveSessionNotificationRow(
  input: SessionNotificationRowInput,
): SessionNotificationRow | undefined {
  const { installation, state: entry, portalStarted } = input;
  const level = input.level ?? 'default';
  if (level === 'muted') {
    return undefined;
  }
  const state = describeSessionState(entry.state ?? undefined);
  if (!state) {
    return undefined;
  }

  const identity = (kind: SessionNotificationRowKind) => {
    const base: SessionNotificationRowIdentity = {
      installation,
      sessionId: entry.sessionId,
      kind,
      ...(entry.changedAt === undefined ? {} : { changedAt: entry.changedAt }),
    };
    return { ...base, id: sessionNotificationRowId(base) };
  };

  if (AWAITING_INPUT_STATES.has(state.key)) {
    const signIn = state.key === 'auth-required';
    return {
      ...identity('waiting'),
      kind: 'waiting',
      waitingFor: signIn ? 'sign-in' : 'input',
      ...(signIn && entry.authServer ? { authServer: entry.authServer } : {}),
    };
  }
  if (!portalStarted) {
    return undefined;
  }
  if (FAILED_STATES.has(state.key)) {
    return {
      ...identity('failed'),
      kind: 'failed',
      reason: entry.failureReason ?? 'other',
    };
  }
  if (state.key === 'completed' && level === 'all') {
    return { ...identity('turn-finished'), kind: 'turn-finished' };
  }
  return undefined;
}
