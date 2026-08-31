import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { AgentRow } from '../components/AgentsDataProvider';
import { sessionsQueryKey } from '../lib/queryKeys';
import {
  buildAgentIndex,
  isListableSession,
  SessionRow,
  sortSessionRows,
  toAgentIdentifier,
  toSessionRow,
} from '../components/SessionsDataProvider/helpers';
import { useKagentCapabilities } from './useKagentCapabilities';

export type AgentSessionsView = {
  /** This agent's sessions, most recent activity first. */
  rows: SessionRow[];
  isLoading: boolean;
  /**
   * True when the installation's kagent runs in `unsecure` mode and so returns
   * *everyone's* sessions. The UI must then stop calling these "yours".
   *
   * Strictly `false` from the probe means user-scoped; `undefined` (probe not
   * resolved, or kagent reported no subject) is not an answer either way, so it
   * does not set this.
   */
  isNotUserScoped: boolean;
  /**
   * kagent could not be read on this installation **and** nothing was read
   * earlier. Distinguishes "no sessions" from "we don't know", without spelling
   * out which failure it was — the sessions list already reports those in detail.
   */
  isUnavailable: boolean;
};

/**
 * The signed-in user's kagent sessions with one agent.
 *
 * Deliberately *not* built on `SessionsDataProvider`: that fans out across every
 * reachable installation, and a details page only ever needs one. It reuses the
 * provider's exact query key, so the two share a cache — arriving from the
 * Sessions tab renders instantly, and this page's fetch warms that tab in turn.
 *
 * Note kagent only lists sessions belonging to the caller, so this can never be
 * "all traffic through this agent" — see {@link AgentSessionsView.isNotUserScoped}
 * for the one exception, which is a misconfiguration rather than a feature.
 */
export function useAgentSessions(
  installation: string,
  namespace: string,
  name: string,
  agentRow?: AgentRow,
): AgentSessionsView {
  const kagentApi = useApi(kagentApiRef);
  const capabilities = useKagentCapabilities(installation);

  const {
    data: sessions,
    isLoading,
    isError,
  } = useQuery({
    // Same key as SessionsDataProvider, deliberately — see the note above.
    queryKey: sessionsQueryKey(installation),
    queryFn: () => kagentApi.listSessions(installation),
    enabled: Boolean(installation),
  });

  // kagent identifies an agent by an encoded `namespace/name`. Match on the
  // encode side rather than decoding kagent's id, because encoding is lossless
  // and decoding is not.
  const agentId = toAgentIdentifier(namespace, name);

  // The join the sessions list uses, so the agent renders identically in both
  // places. A single-entry index is enough here: we already know which agent this
  // is, and reusing `toSessionRow` keeps the row shape (and the avatar seed) in
  // one place.
  const agentIndex = useMemo(
    () => buildAgentIndex(agentRow ? [agentRow] : []),
    [agentRow],
  );

  const rows = useMemo(() => {
    if (!sessions) {
      return [];
    }

    return sortSessionRows(
      sessions
        .filter(isListableSession)
        .filter(session => session.agentId === agentId)
        .map(session => toSessionRow(session, agentIndex)),
    );
  }, [sessions, agentId, agentIndex]);

  return {
    rows,
    isLoading,
    isNotUserScoped: capabilities.isUserScoped === false,
    // Only unavailable when there is genuinely nothing to show. react-query keeps
    // `data` and sets `error` on a failed *refetch*, and this query is shared with
    // the Sessions tab — so arriving from that tab after its entry went stale
    // triggers a background refetch whose failure would otherwise hide sessions
    // that were already read and are still correct.
    isUnavailable: isError && !sessions,
  };
}
