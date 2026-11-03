import {
  deriveSessionNotificationRow,
  type NotificationLevel,
  type SessionFailureReason,
  type SessionNotificationRow,
  type SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import type {
  NotifiableSession,
  SeenMarkTarget,
} from '@giantswarm/backstage-plugin-agent-platform';
import type { DerivedInboxRow } from '../types';

/**
 * A failed row's reason class as the row says it. `other` says nothing more:
 * "turn failed" is already all the row knows.
 */
const FAILURE_REASON_LABELS: Record<SessionFailureReason, string | undefined> =
  {
    'model-unavailable': 'model unavailable',
    'tool-failed': 'tool unavailable',
    'runtime-lost': 'runtime lost',
    other: undefined,
  };

/** What the row rule and the Seen record say about one session. */
export type SessionRecordView = {
  levelOf: (installation: string, sessionId: string) => NotificationLevel;
  isPortalStarted: (installation: string, sessionId: string) => boolean;
  isSeen: (target: SeenMarkTarget) => boolean;
};

export type SessionRowsInput = {
  sessions: ReadonlyMap<string, NotifiableSession>;
  states: ReadonlyMap<string, SessionStateEntry>;
  record: SessionRecordView;
  /** The session's page; undefined when the session route is not bound. */
  hrefOf: (session: NotifiableSession) => string | undefined;
  /** "Mute this session". */
  mute: (session: NotifiableSession) => void;
};

function words(row: SessionNotificationRow, agent: string) {
  switch (row.kind) {
    case 'waiting': {
      if (row.waitingFor === 'sign-in') {
        // No runtime names the server it waits for, so the row cannot.
        const title = `${agent} needs your sign-in`;
        return { title, announce: title };
      }
      return {
        title: `${agent} needs your input`,
        announce: `${agent} is waiting for you`,
      };
    }
    case 'failed':
      return {
        title: `${agent}: turn failed`,
        announce: `${agent}: turn failed`,
      };
    default:
      return {
        title: `${agent} finished its turn`,
        announce: `${agent} finished its turn`,
      };
  }
}

const STATE_CHIPS = {
  waiting: {
    label: 'Waiting',
    tone: 'warning',
    status: 'warning',
    kind: 'waiting',
  },
  failed: { label: 'Failed', tone: 'danger', status: 'danger', kind: 'failed' },
  'turn-finished': {
    label: 'Finished',
    tone: 'success',
    status: 'success',
    kind: 'turnFinished',
  },
} as const;

/** The subject of a session's rows: the session. */
export function sessionSubject(id: string): string {
  return `session:${id}`;
}

/**
 * The inbox rows of the person's sessions: one per session at most, through
 * the row rule (`deriveSessionNotificationRow`), with the session's
 * Notification level, origin and seen mark from the person's record.
 *
 * A session the sessions list does not know (yet) has no row: there is no
 * name to give it. A session the session-states read no longer evaluates
 * (past its recent-sessions window) has none either, like its rail entry.
 * Rows carry the agent's Display name, the session's name and the event, and
 * never any text of the conversation.
 */
export function toSessionRows({
  sessions,
  states,
  record,
  hrefOf,
  mute,
}: SessionRowsInput): DerivedInboxRow[] {
  const rows: DerivedInboxRow[] = [];
  for (const [id, state] of states) {
    const session = sessions.get(id);
    if (!session) {
      continue;
    }
    const { installation, sessionId } = session;
    const derived = deriveSessionNotificationRow({
      installation,
      state,
      level: record.levelOf(installation, sessionId),
      portalStarted: record.isPortalStarted(installation, sessionId),
    });
    if (!derived) {
      continue;
    }
    const agent = session.agentName || 'An agent';
    const target: SeenMarkTarget = {
      kind: 'session',
      installation,
      sessionId,
      mark: derived.id,
    };
    const chip = STATE_CHIPS[derived.kind];
    const { title, announce } = words(derived, agent);
    rows.push({
      id: derived.id,
      subject: sessionSubject(id),
      kind: chip.kind,
      at: derived.changedAt,
      unread: !record.isSeen(target),
      title,
      context: session.title,
      detail:
        derived.kind === 'failed'
          ? FAILURE_REASON_LABELS[derived.reason]
          : undefined,
      state: { label: chip.label, tone: chip.tone },
      avatar: session.agentName
        ? { name: session.agentName, src: session.avatarUrl }
        : undefined,
      href: hrefOf(session),
      announce: {
        title: announce,
        description: session.title,
        status: chip.status,
        linkLabel: 'Open session',
      },
      seenMark: target,
      actions: [
        {
          id: 'mute',
          label: 'Mute this session',
          onAction: () => mute(session),
        },
      ],
    });
  }
  return rows;
}
