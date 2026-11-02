import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { useBotPrs } from './useMarge';

describe('useBotPrs while its read waits', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('stays loading while the first read waits for the network, then shows the queue', async () => {
    // The read does not retry (a failed read is the person's to repeat), so
    // the read that waits is the first one, made while offline: it stays
    // pending without fetching, and `isLoading` alone would call it done.
    onlineManager.setOnline(false);
    const queue = { summary: { total: 0 } };
    const callTool = jest
      .fn()
      .mockResolvedValue({ teams: [{ team: 'bumblebee', result: queue }] });
    const musterApi = {
      callTool,
      listServers: jest.fn(),
    } as unknown as MusterApi;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useBotPrs('gazelle', ['bumblebee']), {
      wrapper,
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.queues[0].isLoading).toBe(true);
    expect(callTool).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(result.current.queues[0].result).toEqual(queue));
    expect(result.current.isLoading).toBe(false);
  });
});
