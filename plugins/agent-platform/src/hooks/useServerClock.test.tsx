import type { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { kagentApiRef, type KagentApi } from '../apis';
import { useServerClock } from './useServerClock';

function wrapperWith(api: Partial<KagentApi>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[kagentApiRef, api]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

describe('useServerClock', () => {
  // A browser clock ten minutes behind must not stretch a three-minute window
  // by ten: the backend's clock is what cluster timestamps compare with.
  it('corrects the browser’s clock by how far it is off the backend’s', async () => {
    const getServerTime = jest.fn(async () => Date.now() + 10 * 60_000);
    const { result } = renderHook(() => useServerClock(), {
      wrapper: wrapperWith({ getServerTime }),
    });

    await waitFor(() =>
      expect(result.current() - Date.now()).toBeGreaterThan(9 * 60_000),
    );
    expect(result.current() - Date.now()).toBeLessThan(11 * 60_000);
  });

  it('falls back to the browser’s clock without a reading', async () => {
    const { result } = renderHook(() => useServerClock(), {
      wrapper: wrapperWith({
        getServerTime: jest.fn(async () => {
          throw new Error('unreachable');
        }),
      }),
    });

    expect(Math.abs(result.current() - Date.now())).toBeLessThan(1_000);
  });
});
