import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useClustersInfo } from './useClustersInfo';

describe('useClustersInfo', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('stays loading while the retry after a 500 waits, then lists the clusters', async () => {
    // A background tab: react-query pauses the retry until it is focused.
    focusManager.setFocused(false);
    const getClusters = jest
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue([{ name: 'gazelle' }]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[kubernetesApiRef, { getClusters } as any]]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useClustersInfo(), { wrapper });

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(result.current).toEqual({ clusters: [], isLoading: true });

    act(() => focusManager.setFocused(true));

    await waitFor(() =>
      expect(result.current).toEqual({
        clusters: ['gazelle'],
        isLoading: false,
      }),
    );
  });
});
