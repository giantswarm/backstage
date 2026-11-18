import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';
import { isPermanentMusterReadError } from '../lib/musterPolling';

/**
 * Whether a failed muster read is tried again (up to three times): never a
 * permanent read error, the one a poll stops on too
 * ({@link isPermanentMusterReadError}: a muster auth failure — a 401 asks
 * for a sign-in, or the client already sent the call again with a refreshed
 * token; a gone portal session would re-run the single main re-login, a
 * popup, for one probe — a 403, a server the session is not connected to),
 * a missing object, a refusal or an unavailable dependency. None of them is transient from a
 * query's point of view, but for a call a rollout of muster interrupted
 * (`kind: interrupted`, a 503). A tool error the backend answered 4xx with
 * its `kind` is a refusal (agent-manager's, muster's of a connector write):
 * asking again gets the same answer. Shared with every plugin that reads through muster
 * (agent-platform's query client builds on it), so the rules cannot drift
 * apart.
 */
export function shouldRetryMusterQuery(failureCount: number, error: unknown) {
  const name = (error as Error | null)?.name;
  const { kind, status } = (error ?? {}) as {
    kind?: unknown;
    status?: unknown;
  };
  if (kind === 'interrupted') {
    return failureCount <= 2;
  }
  if (
    kind !== undefined &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  ) {
    return false;
  }
  if (
    isPermanentMusterReadError(error) ||
    name === 'NotFoundError' ||
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
