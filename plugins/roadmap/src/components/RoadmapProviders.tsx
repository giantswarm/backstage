import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client so all views share one cache across remounts. The
// backend caches board reads for a minute; matching staleTime avoids
// refetch storms when switching between board, team, and detail views.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: (failureCount, error) => {
        const name = (error as Error).name;
        if (
          name === 'NotFoundError' ||
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

export const RoadmapProviders = ({ children }: { children: ReactNode }) => (
  <TanstackQueryClientProvider client={queryClient}>
    {children}
  </TanstackQueryClientProvider>
);
