import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client so the list columns and the tab share one cache across
// remounts; the manager reads the repositories on every call, so a minute of
// staleness spares the person's GitHub quota, not the truth.
export const platformCapabilitiesQueryClient = new QueryClient({
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
          name === 'NotAllowedError' ||
          name === 'ServiceUnavailableError'
        ) {
          return false;
        }
        return failureCount <= 2;
      },
    },
  },
});

export const PlatformCapabilitiesProviders = ({
  children,
}: {
  children: ReactNode;
}) => (
  <TanstackQueryClientProvider client={platformCapabilitiesQueryClient}>
    {children}
  </TanstackQueryClientProvider>
);
