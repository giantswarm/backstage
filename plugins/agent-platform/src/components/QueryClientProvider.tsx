import { ReactNode, useMemo } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { shouldPersistQuery } from '@giantswarm/backstage-plugin-kubernetes-react';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Keep entries in cache for an hour and persist them to localStorage, mirroring
// the gs fleet-list client (Clusters/Deployments). Together with a non-zero
// staleTime this gives the Agents/ModelConfig lists real caching: navigating
// between tabs (or reloading) shows the last-known agents immediately instead of
// blanking and re-querying the whole fleet — and a previously-loaded
// installation's rows don't vanish just because a background refetch was
// triggered and one cluster transiently failed.
const gcTime = 1000 * 60 * 60;
const maxAge = gcTime;

/**
 * Query keys whose data belongs to one *user* rather than to the fleet, and which
 * must therefore never be written to localStorage.
 *
 * Everything else cached here (Agents, ModelConfigs, the kagent installation
 * list) is installation state: identical for every user, and safe to persist.
 * kagent sessions are not — the rows are one user's chat titles, the identity
 * probe caches their subject (an email address), and a session's tasks are the
 * whole conversation, including tool arguments and results.
 *
 * Persisting them would be wrong twice over on a shared workstation: the data
 * outlives sign-out on disk, and `PersistQueryClientProvider` would rehydrate the
 * previous user's sessions for the next one under the same origin and key — which
 * `staleTime` would not even refetch if the entry is under a minute old.
 *
 * `session-tasks` has a second, independent reason: **size**. A real 4-turn
 * session's tasks were ~500 KB against a localStorage budget of roughly 5 MB for
 * the entire origin, so a handful of opened conversations would evict everything
 * else — including the fleet lists this persistence exists for in the first place.
 */
const USER_SCOPED_RESOURCES = new Set([
  'sessions',
  'me',
  'session',
  'session-tasks',
]);

function isUserScopedQueryKey(queryKey: QueryKey): boolean {
  const [scope, subsystem, resource] = queryKey as unknown[];
  return (
    scope === 'agent-platform' &&
    subsystem === 'kagent' &&
    typeof resource === 'string' &&
    USER_SCOPED_RESOURCES.has(resource)
  );
}

/** Exported for testing: the persistence filter applied below. */
export function shouldDehydrateAgentPlatformQuery(queryKey: QueryKey): boolean {
  return !isUserScopedQueryKey(queryKey);
}

export const QueryClientProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useMemo(() => {
    const config: QueryClientConfig = {
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          // Cached list data is treated as fresh for a minute, so switching tabs
          // or remounting reuses it without an immediate background refetch (the
          // refetch is what could error on a single cluster and drop its rows).
          staleTime: 60_000,
          retry: (failureCount, error) => {
            const name = (error as Error).name;
            if (
              name === 'RejectedError' ||
              name === 'NotFoundError' ||
              name === 'UnauthorizedError' ||
              name === 'ForbiddenError' ||
              name === 'ServiceUnavailableError'
            ) {
              return false;
            }
            return failureCount <= 2;
          },
          // Capped exponential backoff so a persistently failing cluster (e.g. an
          // unreachable MC) is retried with increasing spacing instead of
          // hammered, and never waits longer than 30s between attempts.
          retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
          gcTime,
        },
      },
    };
    return new QueryClient(config);
  }, []);

  const persister = useMemo(
    () => createAsyncStoragePersister({ storage: window.localStorage }),
    [],
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge,
        // Two independent reasons to keep a query out of localStorage, both
        // applied. `shouldPersistQuery` carries the shared rules — the library's
        // "only persist successful queries" default plus the `meta`-based opt-out
        // that permission probes use; `shouldDehydrateAgentPlatformQuery` adds
        // this plugin's user-scoped key allowlist (see isUserScopedQueryKey).
        dehydrateOptions: {
          shouldDehydrateQuery: query =>
            shouldPersistQuery(query) &&
            shouldDehydrateAgentPlatformQuery(query.queryKey),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
