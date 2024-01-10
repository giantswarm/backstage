import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (_failureCount, error) => {
        if ((error as Error).name === 'RejectedError') {
          return false;
        }

        return true;
      }
    },
  },
});

export const withQueryClient = (WrappedComponent: React.ComponentType) => {
  return (props: any) => (
    <QueryClientProvider client={queryClient}>
      <WrappedComponent {...props} />
    </QueryClientProvider>
  );
};
