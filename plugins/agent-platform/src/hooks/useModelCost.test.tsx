import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { AuthenticationError, NotFoundError } from '@backstage/errors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useModelCost } from './useModelCost';

const getModelCost = jest.fn();

const kagentApi = { getModelCost } as unknown as KagentApi;

function renderWith(
  installation: string | undefined,
  days = 30,
  options: { enabled?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    queryClient,
    ...renderHook(() => useModelCost(installation, days, options), {
      wrapper,
    }),
  };
}

beforeEach(() => {
  getModelCost.mockReset();
});

describe('useModelCost', () => {
  it('reads the actual cost for the installation and window, and nothing else', async () => {
    getModelCost.mockResolvedValue({
      status: 'actual',
      windowDays: 7,
      totalUsd: 3.5,
      byAgent: [{ agentId: 'kagent__NS__sre_agent', costUsd: 2 }],
      partial: true,
      evaluatedAt: 0,
    });
    const { result } = renderWith('gazelle', 7);

    await waitFor(() => expect(result.current.state).toBe('actual'));
    // The installation and the window are all the client sends; whose cost
    // it is, the backend decides.
    expect(getModelCost).toHaveBeenCalledWith('gazelle', 7);
    expect(result.current).toEqual({
      state: 'actual',
      totalUsd: 3.5,
      byAgent: new Map([['kagent__NS__sre_agent', 2]]),
      partial: true,
    });
  });

  it('passes the backend’s reason through to the fallback', async () => {
    getModelCost.mockResolvedValue({
      status: 'unavailable',
      windowDays: 30,
      reason: 'not-recorded',
    });
    const { result } = renderWith('gazelle');

    await waitFor(() =>
      expect(result.current).toEqual({
        state: 'fallback',
        reason: 'not-recorded',
      }),
    );
  });

  it.each([new NotFoundError('gone'), new AuthenticationError('refused')])(
    'falls back on %p with a reason of its own',
    async error => {
      getModelCost.mockRejectedValue(error);
      const { result } = renderWith('gazelle');

      await waitFor(() =>
        expect(result.current).toEqual({ state: 'fallback', reason: 'error' }),
      );
    },
  );

  it('keeps the figure it showed when a refetch fails', async () => {
    getModelCost.mockResolvedValueOnce({
      status: 'actual',
      windowDays: 30,
      totalUsd: 3.5,
      byAgent: [],
      partial: false,
      evaluatedAt: 0,
    });
    const { result, queryClient } = renderWith('gazelle');
    await waitFor(() => expect(result.current.state).toBe('actual'));

    getModelCost.mockRejectedValueOnce(new Error('kagent hiccup'));
    await queryClient.refetchQueries();
    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          'agent-platform',
          'kagent',
          'model-cost',
          'gazelle',
          30,
        ])?.status,
      ).toBe('error'),
    );

    expect(result.current).toMatchObject({ state: 'actual', totalUsd: 3.5 });
  });

  it('waits rather than falling back while it is held', () => {
    const { result } = renderWith('gazelle', 30, { enabled: false });

    expect(result.current).toEqual({ state: 'loading' });
    expect(getModelCost).not.toHaveBeenCalled();
  });
});
