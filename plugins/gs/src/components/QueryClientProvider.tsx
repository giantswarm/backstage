import { ReactNode, useMemo } from 'react';
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const gcTime = 1000 * 60 * 60;
const maxAge = gcTime;

export const QueryClientProvider = ({ children }: { children: ReactNode }) => {
  const queryOptions: QueryClientConfig = useMemo(
    () => ({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          retry: (failureCount, error) => {
            const name = (error as Error).name;

            if (
              name === 'RejectedError' ||
              name === 'NotFoundError' ||
              name === 'UnauthorizedError' ||
              name === 'ForbiddenError'
            ) {
              return false;
            }

            if (failureCount > 2) {
              return false;
            }

            return true;
          },
          // Capped exponential backoff so a persistently failing cluster (e.g.
          // an unreachable MC) is retried with increasing spacing instead of
          // hammered, and never waits longer than 30s between attempts.
          retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
          gcTime,
        },
      },
    }),
    [],
  );

  const queryClient = useMemo(
    () => new QueryClient(queryOptions),
    [queryOptions],
  );

  const persister = createAsyncStoragePersister({
    storage: window.localStorage,
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
