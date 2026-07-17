import { ReactNode, useMemo } from 'react';
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
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
      persistOptions={{ persister, maxAge }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
