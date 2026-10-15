import { useEffect, useMemo, useState } from 'react';
import type { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSessions } from '../components/SessionsDataProvider';
import {
  ACTIVE_REFETCH_INTERVAL_MS,
  BASELINE_REFETCH_INTERVAL_MS,
} from '../lib/kagentSessionPolling';
import { useAgentAvatarUrl } from './useAgentAvatarUrl';
import { useFleetSessionStates } from './useFleetSessionStates';

/** The avatar size a notification row asks the avatar service for. */
const NOTIFICATION_AVATAR_SIZE = 48;

/** One of the person's sessions, named as a notification names it. */
export type NotifiableSession = {
  /** `${installation}/${sessionId}`, the key of `states` too. */
  id: string;
  installation: string;
  sessionId: string;
  /** The session's name (kagent's title, or the list's fallback). */
  title: string;
  /** The agent's Display name, falling back to its technical name; may be ''. */
  agentName: string;
  /** Where the agent's Avatar is served from, when the portal can tell. */
  avatarUrl?: string;
};

export type NotifiableSessionsView = {
  sessions: ReadonlyMap<string, NotifiableSession>;
  /** Each session's state, from the shell's session-states read. */
  states: ReadonlyMap<string, SessionStateEntry>;
  /**
   * The sessions list and the session states have both answered once, so
   * what is there now is what the tab's first read found.
   */
  isRead: boolean;
};

function isDocumentVisible() {
  return typeof document === 'undefined' || !document.hidden;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(isDocumentVisible);
  useEffect(() => {
    const onChange = () => setVisible(isDocumentVisible());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/**
 * The person's sessions and their states, for the Notification inbox in the
 * Agent Platform shell. Mount inside {@link AgentPlatformProviders}.
 *
 * The states are the shell's own session-states read: the same query keys as
 * the rail's dots, every 10 s while the tab is visible. Unlike the rail, the
 * read goes on while the tab is hidden, on the 60 s baseline tier, so a
 * background tab still learns that a session waits.
 */
export function useNotifiableSessions(): NotifiableSessionsView {
  const { rows, isLoading } = useSessions();
  const buildAvatarUrl = useAgentAvatarUrl();
  const visible = useDocumentVisible();

  const installationsKey = Array.from(
    new Set(rows.map(row => row.installation)),
  )
    .sort()
    .join(',');
  const installations = useMemo(
    () => (installationsKey ? installationsKey.split(',') : []),
    [installationsKey],
  );
  const { states, isLoading: statesLoading } = useFleetSessionStates(
    installations,
    {
      refetchIntervalMs: visible
        ? ACTIVE_REFETCH_INTERVAL_MS
        : BASELINE_REFETCH_INTERVAL_MS,
      refetchIntervalInBackground: true,
    },
  );

  const sessions = useMemo(
    () =>
      new Map(
        rows.map(row => [
          row.id,
          {
            id: row.id,
            installation: row.installation,
            sessionId: row.sessionId,
            title: row.title,
            agentName: row.agentName,
            avatarUrl: buildAvatarUrl(
              row.installation,
              row.agentTechnicalName ?? '',
              { size: NOTIFICATION_AVATAR_SIZE },
            ),
          },
        ]),
      ),
    [rows, buildAvatarUrl],
  );

  return {
    sessions,
    states,
    isRead: !isLoading && !statesLoading,
  };
}
