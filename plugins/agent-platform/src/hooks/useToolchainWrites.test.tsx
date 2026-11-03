import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import {
  useAddToolchainSource,
  useCreateToolchain,
} from './useToolchainWrites';

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;
const analyticsApi = mockApis.analytics.mock();

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

const SOURCE_INPUT = {
  repository: 'acme/toolchains',
  registry: 'registry.example.com/acme',
  slackChannel: '#team-toolchains',
};

beforeEach(() => {
  callTool.mockReset();
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

describe('useAddToolchainSource', () => {
  it('reports a source added, pending until an owner approves it', async () => {
    callTool.mockResolvedValue({
      source: { repository: 'acme/toolchains', offered: false },
      message: 'added',
    });
    const { result } = renderHook(() => useAddToolchainSource('gazelle'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(SOURCE_INPUT);
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_toolchain-manager_add_source',
      SOURCE_INPUT,
      'gazelle',
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.toolchainSourceAdded',
        attributes: { approval: 'pending' },
      }),
    );
  });

  it('reports nothing when the App still has to be installed', async () => {
    callTool.mockResolvedValue({
      status: 'install_required',
      installURL: 'https://github.com/apps/toolchain-manager/installations/new',
      message: 'install it',
    });
    const { result } = renderHook(() => useAddToolchainSource('gazelle'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(SOURCE_INPUT);
    });

    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});

describe('useCreateToolchain', () => {
  it('reports the toolchain opened as a pull request', async () => {
    callTool.mockResolvedValue({
      created: {
        toolchain: 'helm-tools',
        source: 'acme',
        repository: 'acme/toolchains',
        pull: 7,
        pullURL: 'https://github.com/acme/toolchains/pull/7',
        branch: 'toolchain/helm-tools',
      },
      message: 'opened',
    });
    const { result } = renderHook(() => useCreateToolchain('gazelle'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        dockerfile: 'FROM scratch',
        name: 'helm-tools',
        source: 'acme',
      });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.toolchainCreated',
        attributes: {},
      }),
    );
  });
});
