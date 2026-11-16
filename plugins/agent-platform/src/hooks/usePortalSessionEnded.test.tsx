import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PortalSessionEndedError } from '../lib/portalSession';
import { usePortalSessionEnded } from './usePortalSessionEnded';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    ...renderHook(() => usePortalSessionEnded(), { wrapper }),
  };
}

describe('usePortalSessionEnded', () => {
  it('is false while no read failed for the portal session', async () => {
    const { queryClient, result } = setup();

    await act(() =>
      queryClient
        .fetchQuery({
          queryKey: ['a'],
          queryFn: () => Promise.reject(new Error('kagent is down')),
        })
        .catch(() => {}),
    );

    expect(result.current).toBe(false);
  });

  it('turns true once a read fails because the portal refused the session token', async () => {
    const { queryClient, result } = setup();

    await act(() =>
      queryClient
        .fetchQuery({
          queryKey: ['b'],
          queryFn: () => Promise.reject(new PortalSessionEndedError()),
        })
        .catch(() => {}),
    );

    expect(result.current).toBe(true);
  });
});
