import { ReactNode, useMemo } from 'react';
import {
  QueryClient,
  QueryClientConfig,
  QueryClientProvider,
} from '@tanstack/react-query';
import { InstallationsProvider } from './installations/InstallationsProvider';

export const GSContext = ({ children }: { children: ReactNode }) => {
  const queryOptions: QueryClientConfig = useMemo(
    () => ({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          retry: (failureCount, error) => {
            const name = (error as Error).name;

            if (
              name === 'RejectedError' ||
              name === 'NotFoundError' ||
              name === 'ForbiddenError'
            ) {
              return false;
            }

            if (failureCount > 2) {
              return false;
            }

            return true;
          },
        },
      },
    }),
    [],
  );

  const queryClient = useMemo(
    () => new QueryClient(queryOptions),
    [queryOptions],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <InstallationsProvider>{children}</InstallationsProvider>
    </QueryClientProvider>
  );
};
