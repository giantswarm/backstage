import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MusterApi, musterApiRef } from '../../apis';
import { useToolRun } from './useToolRun';

const analyticsApi = mockApis.analytics.mock();

function setup(
  name: string,
  callTool: MusterApi['callTool'],
  onRan?: () => void,
) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <TestApiProvider
      apis={[
        [musterApiRef, { callTool }],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useToolRun(name, 'gazelle', { onRan }), {
    wrapper,
  });
}

describe('useToolRun', () => {
  beforeEach(() => jest.mocked(analyticsApi.captureEvent).mockClear());

  it('reports a workflow’s run, without its inputs, and calls back', async () => {
    const callTool = jest.fn(async () => ({ deployed: 'shop' }));
    const onRan = jest.fn();
    const { result } = setup('workflow_deploy', callTool, onRan);

    act(() => result.current.run({ app: 'shop' }));
    await waitFor(() => expect(result.current.lastResult).toBeDefined());

    expect(callTool).toHaveBeenCalledWith(
      'workflow_deploy',
      { app: 'shop' },
      'gazelle',
    );
    expect(result.current.lastResult?.result).toEqual({ deployed: 'shop' });
    expect(onRan).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Muster.workflowRan',
        subject: 'Muster.workflowRan',
        attributes: {},
      }),
    );
  });

  it('reports no event for any other tool', async () => {
    const callTool = jest.fn(async () => ({ echoed: 'hi' }));
    const { result } = setup('core_echo', callTool);

    act(() => result.current.run({ message: 'hi' }));
    await waitFor(() => expect(result.current.lastResult).toBeDefined());
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('drops the last result on a failed run, reports nothing and still calls back', async () => {
    const callTool = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('workflow deploy is not available'));
    const onRan = jest.fn();
    const { result } = setup('workflow_deploy', callTool, onRan);

    act(() => result.current.run({}));
    await waitFor(() => expect(result.current.lastResult).toBeDefined());
    jest.mocked(analyticsApi.captureEvent).mockClear();

    act(() => result.current.rerun());
    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        'workflow deploy is not available',
      ),
    );
    expect(result.current.lastResult).toBeUndefined();
    expect(onRan).toHaveBeenCalledTimes(2);
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
