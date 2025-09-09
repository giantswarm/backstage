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
