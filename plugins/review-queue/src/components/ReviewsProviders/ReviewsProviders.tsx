import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client, so the searches and the PR states outlive a switch to
// another Hive tab and back. In memory only: the queue is one person's view
// through their GitHub grant and never belongs on a shared workstation's
// disk. A refused call is not retried: the tab shows the refusal, and
// Refresh reads again.
export const reviewQueueQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export const ReviewsProviders = ({ children }: { children: ReactNode }) => (
  <TanstackQueryClientProvider client={reviewQueueQueryClient}>
    {children}
  </TanstackQueryClientProvider>
);
