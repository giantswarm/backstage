import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';
import { isMusterAuthFailure } from '../apis/musterUnauthorized';

/**
 * Whether a failed muster read is tried again (up to three times): never a
 * muster auth failure (a 401 asks for a sign-in, or the client already sent
 * the call again with a refreshed token; a gone portal session would re-run
 * the single main re-login, a popup, for one probe), a missing object, a
 * refusal or an unavailable dependency. None of them is transient from a
 * query's point of view. Shared with every plugin that reads through muster
 * (agent-platform's query client builds on it), so the rules cannot drift
 * apart.
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
