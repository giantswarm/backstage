import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client so both tabs share one cache across remounts. Plan
// documents change rarely; keep them fresh for a minute to avoid refetching
// on every tab switch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      // Refusals are final for this page: a retry would ask the same
      // question again, and a rate-limit refusal (GitHub's 429) only deepens
      // with every repeat.
      retry: (failureCount, error) => {
        const name = (error as Error).name;
        if (
          name === 'NotFoundError' ||
          name === 'MusterServerNotConnectedError' ||
          name === 'UnauthorizedError' ||
          name === 'ForbiddenError' ||
          name === 'TooManyRequestsError' ||
          name === 'ServiceUnavailableError'
        ) {
          return false;
        }
        return failureCount <= 2;
      },
    },
  },
});

export const PlansProviders = ({ children }: { children: ReactNode }) => (
  <TanstackQueryClientProvider client={queryClient}>
    {children}
  </TanstackQueryClientProvider>
);
