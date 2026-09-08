import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { NotFoundError } from '@backstage/errors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionUsageResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useSessionUsage } from './useSessionUsage';

const getSessionUsage = jest.fn();

const kagentApi = { getSessionUsage } as unknown as KagentApi;

const USAGE = {
  evaluatedAt: 1_757_000_000_000,
  windowStart: 1_754_400_000_000,
  windowDays: 30,
  totals: {
    sessions: 2,
    turns: 5,
    inputTokens: 1_000,
    outputTokens: 100,
    totalTokens: 1_100,
    toolCalls: 3,
  },
  daily: [],
  byAgent: [],
  topTools: [],
  topMcpServers: [],
  undatedTurns: 0,
  unreadable: [],
  skipped: 0,
} satisfies SessionUsageResponse;

function renderWith(installation: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSessionUsage(installation), { wrapper });
}

beforeEach(() => {
  getSessionUsage.mockReset();
  getSessionUsage.mockResolvedValue(USAGE);
});

describe('useSessionUsage', () => {
  it('reads the summary for the given installation', async () => {
    const { result } = renderWith('gazelle');

    await waitFor(() => expect(result.current.usage).toBeDefined());
    expect(getSessionUsage).toHaveBeenCalledWith('gazelle');
    expect(result.current.usage?.totals.inputTokens).toBe(1_000);
    expect(result.current.isError).toBe(false);
  });

  it('asks nothing without an installation', async () => {
    const { result } = renderWith(undefined);

    expect(getSessionUsage).not.toHaveBeenCalled();
    // Not "loading" either: there is nothing in flight to wait for, and a
    // spinner with no request behind it never resolves.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.usage).toBeUndefined();
  });

  it('classifies "kagent is not here" as not-deployed, not as an error', async () => {
    // The backend funnels every "no kagent API here" outcome into a 404, and on
    // a fleet where kagent runs on two installations that is the ordinary
    // answer for the rest.
    getSessionUsage.mockRejectedValue(new NotFoundError('no kagent here'));
    const { result } = renderWith('gazelle');

    await waitFor(() => expect(result.current.isNotDeployed).toBe(true));
    expect(result.current.isError).toBe(false);
  });

  it('reports a real failure as an error', async () => {
    getSessionUsage.mockRejectedValue(new Error('kagent is having a moment'));
    const { result } = renderWith('gazelle');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isNotDeployed).toBe(false);
  });

  it('does not poll', async () => {
    // Unlike `useSessionStates` next door. This reports on a 30-day window whose
    // buckets are days, and it is the most expensive read in the plugin.
    jest.useFakeTimers();
    try {
      const { result } = renderWith('gazelle');
      await waitFor(() => expect(result.current.usage).toBeDefined());

      jest.advanceTimersByTime(10 * 60_000);
      await Promise.resolve();

      expect(getSessionUsage).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
