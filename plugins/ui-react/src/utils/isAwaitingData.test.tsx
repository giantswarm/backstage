import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { isAwaitingData } from './isAwaitingData';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('isAwaitingData', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('stays true while the retry after a 500 waits for the tab, until the data', async () => {
    focusManager.setFocused(false);
    const queryFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue(['item']);
    const { result } = renderHook(
      () => useQuery({ queryKey: ['items'], queryFn }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('paused'));
    // react-query's own flag says "not loading" here: the false empty state.
    expect(result.current.isLoading).toBe(false);
    expect(isAwaitingData(result.current)).toBe(true);

    act(() => focusManager.setFocused(true));

    await waitFor(() => expect(result.current.data).toEqual(['item']));
    expect(isAwaitingData(result.current)).toBe(false);
  });

  it('is false for a disabled query, which would never answer', () => {
    const { result } = renderHook(
      () => useQuery({ queryKey: ['off'], queryFn: jest.fn(), enabled: false }),
      { wrapper },
    );
    expect(result.current.isPending).toBe(true);
    expect(isAwaitingData(result.current)).toBe(false);
  });
});
