import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useTrackedMutation,
  type TrackedMutationOptions,
} from './useTrackedMutation';

function renderMutation<TData, TVariables>(
  options: TrackedMutationOptions<TData, Error, TVariables>,
) {
  const analyticsApi = mockApis.analytics.mock();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useTrackedMutation(options), { wrapper }),
    captureEvent: analyticsApi.captureEvent,
  };
}

describe('useTrackedMutation', () => {
  it('reports the event after the write succeeded, then runs onSuccess', async () => {
    const onSuccess = jest.fn();
    const { result, captureEvent } = renderMutation({
      mutationFn: async (mode: 'deploy' | 'commit') => mode,
      event: (_data, mode) => ({
        name: 'AgentPlatform.agentCreated',
        attributes: { mode },
      }),
      onSuccess,
    });

    await act(() => result.current.mutateAsync('commit'));

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.agentCreated',
        attributes: { mode: 'commit' },
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith(
      'commit',
      'commit',
      undefined,
      expect.anything(),
    );
  });

  it('reports nothing when the write fails', async () => {
    const { result, captureEvent } = renderMutation({
      mutationFn: async () => {
        throw new Error('refused');
      },
      event: () => ({
        name: 'AgentPlatform.agentCreated',
        attributes: { mode: 'deploy' },
      }),
    });

    await act(() => result.current.mutateAsync().catch(() => undefined));

    expect(captureEvent).not.toHaveBeenCalled();
  });

  it('reports nothing for a success the event maps to null', async () => {
    const { result, captureEvent } = renderMutation({
      mutationFn: async (isEdit: boolean) => isEdit,
      event: (_data, isEdit) =>
        isEdit
          ? null
          : {
              name: 'Muster.mcpServerAdded',
              attributes: { authMode: 'none' },
            },
    });

    await act(() => result.current.mutateAsync(true));

    expect(captureEvent).not.toHaveBeenCalled();
  });

  it('reports nothing for an untracked write', async () => {
    const onSuccess = jest.fn();
    const { result, captureEvent } = renderMutation({
      mutationFn: async () => 'done',
      event: null,
      untrackedReason: 'test',
      onSuccess,
    });

    await act(() => result.current.mutateAsync());

    expect(captureEvent).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });
});
