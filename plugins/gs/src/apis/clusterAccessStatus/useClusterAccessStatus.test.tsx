import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { ClusterAccessStatusStore } from './ClusterAccessStatusStore';
import { clusterAccessStatusApiRef } from './types';
import { useClusterAccessStatus } from './useClusterAccessStatus';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('useClusterAccessStatus', () => {
  it('keeps the same array while the states are unchanged, and follows changes', async () => {
    const store = ClusterAccessStatusStore.create();
    store.recordHealthy('alba');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[clusterAccessStatusApiRef, store]]}>
        {children}
      </TestApiProvider>
    );
    const { result } = renderHook(() => useClusterAccessStatus(), { wrapper });
    const first = result.current;
    // The subscription replays a fresh, equal snapshot on subscribe.
    await act(tick);
    expect(result.current).toBe(first);

    act(() => store.recordDegraded('alba', 'Access forbidden'));
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual([
      expect.objectContaining({
        installation: 'alba',
        state: 'degraded',
        reason: 'Access forbidden',
      }),
    ]);
  });
});
