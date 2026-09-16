import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client so the listing and the expanded records share one
// cache across remounts. The inventory is a cache itself, rebuilt by sweeps;
// a minute of staleness is nothing next to the record's own age.
export const repositoriesQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: (failureCount, error) => {
        const name = (error as Error).name;
        if (
          name === 'NotFoundError' ||
          name === 'MusterServerNotConnectedError' ||
          name === 'UnauthorizedError' ||
          name === 'ForbiddenError' ||
          name === 'ServiceUnavailableError'
        ) {
          return false;
        }
        return failureCount <= 2;
      },
    },
  },
});

export const RepositoriesProviders = ({
  children,
}: {
  children: ReactNode;
}) => (
  <TanstackQueryClientProvider client={repositoriesQueryClient}>
    {children}
  </TanstackQueryClientProvider>
);
