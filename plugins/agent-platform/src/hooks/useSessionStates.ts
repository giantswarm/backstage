import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { sessionStatesQueryKey } from '../lib/queryKeys';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../lib/kagentSessionPolling';

export type SessionStatesView = {
  /** Derived state per session id. Absent means the summary did not evaluate it. */
  states: Map<string, SessionStateEntry>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/**
 * Derived state for one installation's sessions.
 *
 * One cheap read of a summary the backend computed — see "Session states" in
 * `docs/agent-platform.md` for why the fan-out over each session's conversation
 * happens there and not here.
 *
 * **Polls on the fast tier**, unconditionally. Everywhere else in this plugin the
 * interval is decided from the data in hand: poll quickly only while something is
 * demonstrably moving. That reasoning inverts here, because this read is what
 * *tells* the page whether anything is moving. Gating it on its own last answer
 * would mean a session that starts working while the rail believes the fleet idle
 * takes a minute to appear — which is the one moment the rail exists for. The
 * backend's 15 s cache is what keeps the cost of that flat: most of these
 * requests are answered from memory without touching kagent.
 */
export function useSessionStates(installation: string): SessionStatesView {
  const kagentApi = useApi(kagentApiRef);

  const query = useQuery({
    queryKey: sessionStatesQueryKey(installation),
    queryFn: () => kagentApi.listSessionStates(installation),
    enabled: Boolean(installation),
    refetchInterval: ACTIVE_REFETCH_INTERVAL_MS,
  });

  const states = useMemo(() => {
    const index = new Map<string, SessionStateEntry>();
    for (const entry of query.data?.states ?? []) {
      index.set(entry.sessionId, entry);
    }
    return index;
  }, [query.data]);

  return {
    states,
    // `isLoading` only on the first load. A failed *refetch* keeps the previous
    // states, so the rail goes on rendering what it last knew rather than
    // collapsing to a notice for one bad poll.
    isLoading: query.isLoading,
    isError: query.isError && query.data === undefined,
    refetch: query.refetch,
  };
}
