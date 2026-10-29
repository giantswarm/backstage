import { useCallback, useMemo } from 'react';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  agentPlatformPlugin,
  useNotifiableSessions,
  useSessionNotificationRecord,
  type NotifiableSession,
} from '@giantswarm/backstage-plugin-agent-platform';
import type { DerivedInboxRow, InboxRowSource } from '../types';
import { sessionSubject, toSessionRows } from '../utils/sessionRows';

type NotificationRecord = ReturnType<typeof useSessionNotificationRecord>;

/**
 * The inbox rows of the person's Agent Platform sessions, derived in the
 * browser from the shell's own session-states read and the person's
 * notification record. Nothing is sent or stored for them but the seen marks.
 * Mount inside `AgentPlatformProviders`.
 */
export function useSessionRowSource(
  record: NotificationRecord,
): InboxRowSource<DerivedInboxRow> {
  const toastApi = useApi(toastApiRef);
  const sessionDetailRoute = useRouteRef(
    agentPlatformPlugin.routes.sessionDetail,
  );
  const { sessions, states, isRead } = useNotifiableSessions();
  const { setLevel, levelOf, isPortalStarted, isSeen } = record;

  const hrefOf = useCallback(
    (session: NotifiableSession) =>
      sessionDetailRoute?.({
        installation: session.installation,
        sessionId: session.sessionId,
      }),
    [sessionDetailRoute],
  );

  const mute = useCallback(
    (session: NotifiableSession) => {
      setLevel(session.installation, session.sessionId, 'muted').catch(() => {
        toastApi.post({
          title: 'Could not mute the session',
          status: 'danger',
          timeout: 8000,
        });
      });
    },
    [setLevel, toastApi],
  );

  const rows = useMemo(
    () =>
      toSessionRows({
        sessions,
        states,
        record: { levelOf, isPortalStarted, isSeen },
        hrefOf,
        mute,
      }),
    [sessions, states, levelOf, isPortalStarted, isSeen, hrefOf, mute],
  );

  // Only sessions the list can name: a state the list does not know yet
  // (the list is being read again) is not watched until it is.
  const subjects = useMemo(
    () =>
      new Set(
        [...states.keys()].filter(id => sessions.has(id)).map(sessionSubject),
      ),
    [states, sessions],
  );

  return { rows, subjects, ready: isRead && record.isKnown };
}
