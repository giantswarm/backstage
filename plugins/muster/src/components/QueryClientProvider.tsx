import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';
import { isMusterAuthFailure } from '../apis/musterUnauthorized';

/**
 * Whether a failed read is tried again: never a muster auth failure (a 401
 * asks for a sign-in, or the client already sent the call again with a
 * refreshed token; a failed token mint would re-run the single main re-login,
 * a popup, up to three times for one probe), a missing object or an
 * unavailable dependency. Neither is transient from a query's point of view.
 */
export function shouldRetryMusterQuery(failureCount: number, error: unknown) {
  const name = (error as Error | null)?.name;
  if (
    isMusterAuthFailure(error) ||
    name === 'NotFoundError' ||
    name === 'ForbiddenError' ||
    name === 'ServiceUnavailableError'
  ) {
    return false;
  }
  return failureCount <= 2;
}

// Module-level client so all mounts (list page, detail page) share one live
// QueryClient. No persistence: workflow executions are live data.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetryMusterQuery,
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
