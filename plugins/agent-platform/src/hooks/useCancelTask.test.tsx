import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useCancelTask } from './useCancelTask';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

const cancelTask = jest.fn();
const kagentApi = { cancelTask } as unknown as KagentApi;
const analyticsApi = mockApis.analytics.mock();

function renderWith() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kagentApiRef, kagentApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useCancelTask('gazelle', 'abc'), { wrapper }),
    invalidateQueries,
  };
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
  cancelTask.mockReset();
  cancelTask.mockResolvedValue(undefined);
});

describe('useCancelTask', () => {
  it('cancels the task on the server, re-reads the conversation and reports the stop', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.cancelTask('task-1');
    });

    expect(cancelTask).toHaveBeenCalledWith('gazelle', 'abc', 'task-1');
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: sessionTasksQueryKey('gazelle', 'abc'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: sessionQueryKey('gazelle', 'abc'),
    });
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.turnStopped',
        attributes: {},
      }),
    );
  });

  it('reports nothing when the stop failed', async () => {
    cancelTask.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.cancelTask('task-1')).rejects.toThrow(
        'kagent said no',
      );
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('kagent said no'),
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
