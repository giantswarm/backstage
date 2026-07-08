import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client shared by every mount in this plugin (form + review), so
// the ModelConfig list stays warm across the create flow.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
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

export const QueryClientProvider = ({ children }: { children: ReactNode }) => {
  return (
    <TanstackQueryClientProvider client={queryClient}>
      {children}
    </TanstackQueryClientProvider>
  );
};
