import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { useToolsetPresets } from './useToolsetPresets';

describe('useToolsetPresets', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('stays loading while the retry after a 500 waits, then offers muster’s presets', async () => {
    // A background tab: react-query pauses the retry until it is focused.
    focusManager.setFocused(false);
    const filterTools = jest
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue({ tools: [], presets: [] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider
        apis={[[musterApiRef, { filterTools } as unknown as MusterApi]]}
      >
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useToolsetPresets('gazelle'), {
      wrapper,
    });

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeUndefined();

    act(() => focusManager.setFocused(true));

    await waitFor(() => expect(result.current.source).toBe('muster'));
    expect(result.current.isLoading).toBe(false);
  });
});
