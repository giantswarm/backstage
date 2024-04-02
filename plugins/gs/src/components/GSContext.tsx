import React, { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientConfig,
  QueryClientProvider,
} from '@tanstack/react-query';

export const GSContext = ({ children }: { children: ReactNode }) => {
  const queryOptions: QueryClientConfig = {
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: (_failureCount, error) => {
          if ((error as Error).name === 'RejectedError') {
            return false;
          }

          return true;
        },
      },
    },
  };
  const queryClient = new QueryClient(queryOptions);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
