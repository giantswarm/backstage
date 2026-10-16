import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { usePageAttention } from '@giantswarm/backstage-plugin-ui-react';
import { useSessions } from '../components/SessionsDataProvider';
import {
  ACTIVE_REFETCH_INTERVAL_MS,
  BASELINE_REFETCH_INTERVAL_MS,
} from '../lib/kagentSessionPolling';
import { sessionsQueryKey } from '../lib/queryKeys';
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
   * Every installation's sessions list and session states have answered (or
   * failed) once, so what is there now is the tab's whole first read, not the
   * part the fastest installation sent.
   */
  isRead: boolean;
};

/**
 * The person's sessions and their states, for the Notification inbox in the
 * Agent Platform shell. Mount inside {@link AgentPlatformProviders}.
 *
 * The states are the shell's own session-states read: the same query keys as
 * the rail's dots, every 10 s while the tab is visible. Unlike the rail, the
 * read goes on while the tab is hidden, on the 60 s baseline tier, so a
 * background tab still learns that a session waits.
 *
 * The sessions list itself is not polled. When a state names a session the
 * list does not know (one started since, from Slack or by an orchestrator),
 * that installation's list is read again, once per such session, so the
 * session can be named — hidden tab or not.
 */
export function useNotifiableSessions(): NotifiableSessionsView {
  const { rows, isLoading, isLoadingMore } = useSessions();
  const buildAvatarUrl = useAgentAvatarUrl();
  const { visible } = usePageAttention();
  const queryClient = useQueryClient();

  const installationsKey = Array.from(
    new Set(rows.map(row => row.installation)),
  )
    .sort()
    .join(',');
  const installations = useMemo(
    () => (installationsKey ? installationsKey.split(',') : []),
    [installationsKey],
  );
  const { states, isComplete } = useFleetSessionStates(installations, {
    refetchIntervalMs: visible
      ? ACTIVE_REFETCH_INTERVAL_MS
      : BASELINE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

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

  // A state for a session the list has not seen: read that installation's
  // list again. Once per session, so a session the list leaves out on
  // purpose (not listable) cannot make it read over and over.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const stale = new Set<string>();
    for (const [id, entry] of states) {
      if (!sessions.has(id) && !asked.current.has(id)) {
        asked.current.add(id);
        stale.add(id.slice(0, id.length - entry.sessionId.length - 1));
      }
    }
    stale.forEach(installation => {
      queryClient
        .invalidateQueries({ queryKey: sessionsQueryKey(installation) })
        .catch(() => {});
    });
  }, [states, sessions, queryClient]);

  return {
    sessions,
    states,
    isRead: !isLoading && !isLoadingMore && isComplete,
  };
}
