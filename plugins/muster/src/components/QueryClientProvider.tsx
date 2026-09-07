import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';
import { MUSTER_TOKEN_MINT_ERROR_NAME } from '../apis/installationToken';

// Module-level client so all mounts (list page, detail page) share one live
// QueryClient. No persistence: workflow executions are live data.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const name = (error as Error).name;
        // A failed token mint is not transient from a query's point of view:
        // retrying it would re-run the single main re-login (a popup) up to
        // three times for one probe.
        if (
          name === 'NotFoundError' ||
          name === 'UnauthorizedError' ||
          name === 'ForbiddenError' ||
          name === 'ServiceUnavailableError' ||
          name === MUSTER_TOKEN_MINT_ERROR_NAME
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
