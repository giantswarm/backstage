import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type {
  CreateClusterInput,
  CreateNodePoolInput,
} from '../lib/clusterManager';
import { useClusterWrite, useNodePoolWrite } from './useClusterManager';

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;
const analyticsApi = mockApis.analytics.mock();

const cluster: CreateClusterInput = {
  organization: 'acme',
  name: 'demo1',
  provider: 'aws',
  release: '33.1.0',
};

const pool: CreateNodePoolInput = {
  cluster: 'wc1',
  namespace: 'org-acme',
  name: 'gpu-l4',
};

const answer = (extra: Record<string, unknown> = {}) => ({
  cluster: 'demo1',
  namespace: 'org-acme',
  pool: '',
  mode: 'apply',
  dryRun: false,
  objects: [],
  ...extra,
});

function wrapper({ children }: PropsWithChildren<{}>) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return (
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

beforeEach(() => {
  callTool.mockReset();
  callTool.mockResolvedValue(answer());
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

describe('useClusterWrite', () => {
  it('reports a created cluster with its mode', async () => {
    const { result } = renderHook(() => useClusterWrite('inst-1'), {
      wrapper,
    });

    await act(() => result.current.create(cluster, { mode: 'commit' }));

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.clusterCreated',
        attributes: { mode: 'commit' },
      }),
    );
  });

  it('reports nothing for a dry run, a partial apply or a deletion', async () => {
    const { result } = renderHook(() => useClusterWrite('inst-1'), {
      wrapper,
    });

    await act(() =>
      result.current.create(cluster, { mode: 'apply', dryRun: true }),
    );
    callTool.mockResolvedValueOnce(answer({ partial: true }));
    await act(() => result.current.create(cluster, { mode: 'apply' }));
    await act(() =>
      result.current.remove(
        { organization: 'acme', name: 'demo1' },
        { mode: 'apply' },
      ),
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();

    // Continue: the same call completes the cluster, and reports it once.
    await act(() => result.current.create(cluster, { mode: 'apply' }));
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
  });

  it('counts a write as writing, and a dry run only as busy', async () => {
    let land: (value: unknown) => void = () => {};
    callTool.mockImplementation(
      () =>
        new Promise(resolve => {
          land = resolve;
        }),
    );
    const { result } = renderHook(() => useClusterWrite('inst-1'), {
      wrapper,
    });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.create(cluster, { mode: 'apply', dryRun: true });
    });
    await waitFor(() => expect(result.current.isBusy).toBe(true));
    expect(result.current.isWriting).toBe(false);
    await act(async () => {
      land(answer({ dryRun: true }));
      await pending;
    });

    act(() => {
      pending = result.current.remove(
        { organization: 'acme', name: 'demo1' },
        { mode: 'apply' },
      );
    });
    await waitFor(() => expect(result.current.isWriting).toBe(true));
    await act(async () => {
      land(answer());
      await pending;
    });
    await waitFor(() => expect(result.current.isWriting).toBe(false));
  });

  it('keeps a refusal as the failure and reports nothing', async () => {
    callTool.mockRejectedValue(new Error('release 33.1.0 is not active'));
    const { result } = renderHook(() => useClusterWrite('inst-1'), {
      wrapper,
    });

    await act(() =>
      result.current.create(cluster, { mode: 'apply' }).catch(() => undefined),
    );

    expect(result.current.failure?.message).toContain('is not active');
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});

describe('useNodePoolWrite', () => {
  it('reports an added node pool with its mode, and not its dry run', async () => {
    const { result } = renderHook(() => useNodePoolWrite('inst-1'), {
      wrapper,
    });

    await act(() => result.current.dryRun(pool));
    await act(() => result.current.create(pool, 'apply'));

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.nodePoolCreated',
        attributes: { mode: 'apply' },
      }),
    );
  });

  it('reports nothing for a partial apply', async () => {
    callTool.mockResolvedValue(answer({ partial: true }));
    const { result } = renderHook(() => useNodePoolWrite('inst-1'), {
      wrapper,
    });

    await act(() => result.current.create(pool, 'apply'));

    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
