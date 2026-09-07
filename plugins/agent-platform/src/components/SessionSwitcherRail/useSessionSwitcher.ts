import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  isListableSession,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../../apis';
import { useAgentIndex } from '../../hooks/useAgentIndex';
import { useSessionStates } from '../../hooks/useSessionStates';
import { BASELINE_REFETCH_INTERVAL_MS } from '../../lib/kagentSessionPolling';
import { sessionsQueryKey } from '../../lib/queryKeys';
import { toSessionRow } from '../SessionsDataProvider/helpers';
import {
  countSessions,
  groupActiveSessions,
  RailGroup,
  withCurrentSessionState,
} from './helpers';

/** How often the rendered ages are recomputed, so `16m` becomes `17m` unprompted. */
const AGE_TICK_MS = 30_000;

export type SessionSwitcherView = {
  groups: RailGroup[];
  activeCount: number;
  /**
   * Sessions the backend could not read, plus ones it never evaluated.
   *
   * Together these are why the rail must not present an empty result as "All
   * caught up.": with either non-zero, the honest claim is that it cannot tell,
   * and `activeCount` is a floor rather than a total.
   */
  unreadableCount: number;
  skippedCount: number;
  /** True when the summary is incomplete, so what the rail shows is a subset. */
  isPartial: boolean;
  /** The session list has not arrived yet. */
  isLoading: boolean;
  /** The list is here but the states are not, so nothing can be grouped yet. */
  isStatesLoading: boolean;
  /** Neither read produced anything usable. */
  isError: boolean;
  /** Epoch ms, advanced on a timer, for the cards to compute their ages against. */
  now: number;
  refetch: () => void;
};

/**
 * Everything the rail renders, for one installation.
 *
 * Two reads joined on the session id. The list is the same `sessionsQueryKey`
 * the Sessions tab and the agent detail card use, so arriving from the list
 * costs nothing and a deep link warms the cache for them in turn — which is also
 * why this reads one installation directly rather than mounting
 * `SessionsDataProvider`: that provider deliberately fans out across the fleet
 * for the list page, and the detail page has exactly one installation, named in
 * its own route.
 *
 * The list polls on the **baseline** tier: it only has to notice a session
 * created or renamed elsewhere, and everything that moves quickly lives in the
 * states read. `refetchInterval` is per-observer, so this does not speed up or
 * slow down the same query on any other screen.
 */
export function useSessionSwitcher(
  installation: string,
  options: {
    enabled?: boolean;
    /**
     * The detail page's own reading of the session it is showing, which is
     * always fresher than the cached summary. See `withCurrentSessionState`.
     */
    currentSessionState?: SessionStateEntry;
  } = {},
): SessionSwitcherView {
  const enabled = options.enabled ?? true;
  const { currentSessionState } = options;
  const kagentApi = useApi(kagentApiRef);
  const agentIndex = useAgentIndex();

  const sessions = useQuery({
    queryKey: sessionsQueryKey(installation),
    queryFn: () => kagentApi.listSessions(installation),
    enabled: enabled && Boolean(installation),
    refetchInterval: BASELINE_REFETCH_INTERVAL_MS,
  });

  const {
    states,
    unreadableCount,
    skippedCount,
    isLoading: isStatesLoading,
    isError: isStatesError,
    refetch: refetchStates,
  } = useSessionStates(enabled ? installation : '');

  const now = useNow(AGE_TICK_MS);

  const rows = useMemo(
    () =>
      (sessions.data ?? [])
        .filter(isListableSession)
        .map(session => toSessionRow(session, agentIndex)),
    [sessions.data, agentIndex],
  );

  const groups = useMemo(
    () =>
      groupActiveSessions(
        rows,
        withCurrentSessionState(
          states as Map<string, SessionStateEntry>,
          currentSessionState,
        ),
        now,
      ),
    [rows, states, currentSessionState, now],
  );

  return {
    groups,
    activeCount: countSessions(groups),
    unreadableCount,
    skippedCount,
    isPartial: unreadableCount > 0 || skippedCount > 0,
    isLoading: sessions.isLoading,
    isStatesLoading,
    isError: (sessions.isError && sessions.data === undefined) || isStatesError,
    now,
    refetch: () => {
      sessions.refetch();
      refetchStates();
    },
  };
}

/**
 * A clock that ticks, so a card reading `16m` becomes `17m` without a refetch.
 *
 * Only the rendered *labels* depend on it — sorting keys off `changedAt`, which
 * does not move — so a tick can never reorder the rail under someone's cursor.
 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
