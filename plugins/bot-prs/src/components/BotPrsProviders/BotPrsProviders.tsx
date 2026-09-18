import { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

// Module-level client so the queue and the dialogs share one cache across
// remounts, in memory only: the queue is one person's view through their
// GitHub grant and never belongs on a shared workstation's disk. A refused
// call is not retried; the page shows the refusal and the person decides.
export const botPrsQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: false,
    },
    mutations: { retry: false },
  },
});

export const BotPrsProviders = ({ children }: { children: ReactNode }) => (
  <TanstackQueryClientProvider client={botPrsQueryClient}>
    {children}
  </TanstackQueryClientProvider>
);
