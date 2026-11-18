import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';
import { isPermanentReadError } from '@giantswarm/backstage-plugin-ui-react';

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
        // A permanent read error (a 401, a 403, a muster server the session
        // is not connected to: the one a poll stops on,
        // `isPermanentReadError`), and what this client adds to it.
        if (
          isPermanentReadError(error) ||
          name === 'NotFoundError' ||
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
