import { ReactNode } from 'react';
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const gcTime = 1000 * 60 * 60;
const maxAge = gcTime;

const queryOptions: QueryClientConfig = {
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
      gcTime,
    },
  },
};

// Module-level client so all mounts (e.g. the flux list and tree sub-pages)
// share one live QueryClient instead of re-hydrating from the persister on
// every mount.
const queryClient = new QueryClient(queryOptions);

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
});

export const QueryClientProvider = ({ children }: { children: ReactNode }) => {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
