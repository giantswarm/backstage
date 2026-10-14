import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import { useMusterInstallations } from './useMusterInstallations';

describe('useMusterInstallations after a failed read', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('stays loading while the retry after a 500 waits, then lists the installations', async () => {
    // A background tab: react-query pauses the retry until it is focused.
    focusManager.setFocused(false);
    const listInstallations = jest
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue({
        installations: [
          { name: 'gazelle', requiresAuth: true, reachable: true },
        ],
      });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider
        apis={[[musterApiRef, { listInstallations } as unknown as MusterApi]]}
      >
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useMusterInstallations(), { wrapper });

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.installations).toEqual([]);

    act(() => focusManager.setFocused(true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations.map(i => i.name)).toEqual(['gazelle']);
  });
});
