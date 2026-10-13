import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  type AuthStatusResponse,
  musterApiRef,
  type ServerAuthStatus,
} from '../../../apis';
import {
  authStatusQueryKey,
  DEFAULT_POLL_INTERVAL_MS,
  NEEDS_LOGIN,
  pendingKey,
  pendingSignInsKey,
  type PendingSignIn,
  readPending,
} from '../useServerSignIn';

/** A sign-in outstanding on the installation, and when it gives up. */
type PendingServer = { serverName: string; deadline: number };

/**
 * The sign-ins outstanding on `installation`. The snapshot is a string, so
 * the subscription re-renders only when the set or a deadline changes (a
 * reopen writes a fresh one), not on every cache event.
 */
function usePendingServers(installation: string | undefined): PendingServer[] {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  const snapshot = useCallback(
    () =>
      JSON.stringify(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: pendingSignInsKey(installation) })
          .flatMap(query => {
            const pending = query.state.data as PendingSignIn | null;
            return pending
              ? [
                  {
                    serverName: String(query.queryKey[3]),
                    deadline: pending.deadline,
                  },
                ]
              : [];
          })
          .sort((a, b) => a.serverName.localeCompare(b.serverName)),
      ),
    [queryClient, installation],
  );
  const json = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => JSON.parse(json) as PendingServer[], [json]);
}

/**
 * `auth://status` for a list of servers, which also finishes their sign-ins.
 *
 * {@link useServerSignIn} ends a sign-in when muster reports the server
 * `connected`: it clears the pending entry and re-reads every muster query, so
 * the server's tools appear. It can only do that while it is mounted, and a
 * list renders a server's sign-in only while muster asks for one. The read
 * that reports `connected` is the same read that drops the row's sign-in, so
 * the row's hook unmounts before its effect sees the answer: the tools stayed
 * stale until a reload, and the pending entry outlived the flow (a later
 * `reauth_required` read "Signing in…" at once).
 *
 * Mounted by the list itself, which stays, this hook does the same for every
 * server on the installation: it polls while any sign-in is outstanding,
 * ends each one muster reports `connected` (and each that reaches its
 * deadline), and re-reads every muster query on a needs-login to `connected`
 * transition, like the row's hook. Both may run for one answer; a second
 * invalidation only repeats a refetch.
 *
 * `pending` names the servers with a sign-in outstanding, so the list can
 * keep their sign-in in view while a read says nothing about them (an
 * unreadable status answers an empty list).
 */
export function useAuthStatus(
  installation: string | undefined,
  enabled = true,
): {
  query: UseQueryResult<AuthStatusResponse>;
  pending: ReadonlySet<string>;
} {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  const pendingServers = usePendingServers(installation);
  const isWaiting = pendingServers.length > 0;

  const query = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: enabled && Boolean(installation),
    // The same read options as useServerSignIn's, for the same reasons:
    // keep polling while the person is on the sign-in page's tab, and re-read
    // when they come back.
    refetchInterval: isWaiting ? DEFAULT_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const lastKnown = useRef(new Map<string, ServerAuthStatus['status']>());
  useEffect(() => {
    const servers = query.data?.servers;
    if (!servers) {
      return;
    }
    let signedIn = false;
    for (const server of servers) {
      const previous = lastKnown.current.get(server.name);
      lastKnown.current.set(server.name, server.status);
      if (server.status !== 'connected') {
        continue;
      }
      if (readPending(queryClient, installation, server.name)) {
        queryClient.setQueryData(pendingKey(installation, server.name), null);
        signedIn = true;
      } else if (previous !== undefined && NEEDS_LOGIN.includes(previous)) {
        signedIn = true;
      }
    }
    if (signedIn) {
      queryClient.invalidateQueries({ queryKey: ['muster'] });
    }
  }, [query.data, queryClient, installation]);

  // A row's hook clears its entry at the deadline, but only while mounted.
  useEffect(() => {
    const timers = pendingServers.map(({ serverName, deadline }) =>
      setTimeout(
        () =>
          queryClient.setQueryData(pendingKey(installation, serverName), null),
        Math.max(0, deadline - Date.now()),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [pendingServers, queryClient, installation]);

  const pending = useMemo(
    () => new Set(pendingServers.map(({ serverName }) => serverName)),
    [pendingServers],
  );
  return { query, pending };
}
