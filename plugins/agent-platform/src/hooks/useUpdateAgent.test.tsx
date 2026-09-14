import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useUpdateAgent } from './useUpdateAgent';

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;

function renderWith(installation: string | undefined = 'gazelle') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useUpdateAgent(installation), { wrapper }),
    invalidateQueries,
  };
}

beforeEach(() => {
  callTool.mockReset();
});

describe('useUpdateAgent', () => {
  it('sends exactly the update it is given to x_agent-manager_update_agent and drops the cached reads', async () => {
    callTool.mockResolvedValue({
      agent: {
        name: 'pr-reviewer',
        namespace: 'kagent',
        managed: 'helmrelease',
      },
      before: { agent: { description: 'old' } },
      after: { agent: { description: 'new' } },
      changed: ['agent.description'],
      manifests: { ociRepository: '', helmRelease: '', values: {} },
      requestedBy: 'admin@lab.local',
    });
    const { result, invalidateQueries } = renderWith();

    let outcome;
    await act(async () => {
      outcome = await result.current.update({
        namespace: 'kagent',
        name: 'pr-reviewer',
        description: 'new',
      });
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_update_agent',
      { namespace: 'kagent', name: 'pr-reviewer', description: 'new' },
      'gazelle',
    );
    expect(outcome).toMatchObject({
      changed: ['agent.description'],
      requestedBy: 'admin@lab.local',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['cluster', 'gazelle', 'get', 'kagent.dev'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        'muster',
        'agent-platform',
        'agent-manager-agent',
        'gazelle',
        'kagent',
        'pr-reviewer',
      ],
    });
  });

  it('passes refreshSkills through untouched — the only argument of Update skills', async () => {
    callTool.mockResolvedValue({
      agent: {
        name: 'pr-reviewer',
        namespace: 'kagent',
        managed: 'helmrelease',
      },
      before: {},
      after: {},
      changed: ['skills'],
      manifests: { ociRepository: '', helmRelease: '', values: {} },
    });
    const { result } = renderWith();

    await act(async () => {
      await result.current.update({
        namespace: 'kagent',
        name: 'pr-reviewer',
        refreshSkills: true,
      });
    });

    expect(callTool.mock.calls[0][1]).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      refreshSkills: true,
    });
  });

  it("surfaces agent-manager's refusal for a suspended release verbatim", async () => {
    callTool.mockRejectedValue(
      new Error(
        'conflict: HelmRelease kagent/pr-reviewer is suspended: Flux will not act on a change. Resume it first, or pass force',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current
        .update({ namespace: 'kagent', name: 'pr-reviewer', description: 'x' })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.failure).toEqual({
        kind: 'refused',
        code: 'conflict',
        message:
          'HelmRelease kagent/pr-reviewer is suspended: Flux will not act on a change. Resume it first, or pass force',
      });
    });
  });

  it("surfaces the apiserver's Forbidden for a viewer", async () => {
    callTool.mockRejectedValue(
      new Error(
        'forbidden: update HelmRelease kagent/pr-reviewer: helmreleases.helm.toolkit.fluxcd.io "pr-reviewer" is forbidden: User "oidc:viewer@lab.local" cannot update resource "helmreleases"',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current
        .update({
          namespace: 'kagent',
          name: 'pr-reviewer',
          refreshSkills: true,
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.failure?.code).toBe('forbidden');
    });
  });

  it('commits through update_agent with mode: commit', async () => {
    callTool.mockResolvedValue({
      status: 'auth_required',
      authUrl: 'https://x',
    });
    const { result } = renderWith();

    let outcome;
    await act(async () => {
      outcome = await result.current.commit({
        namespace: 'kagent',
        name: 'pr-reviewer',
        description: 'x',
      });
    });

    expect(callTool.mock.calls[0][1]).toMatchObject({ mode: 'commit' });
    expect(outcome).toEqual({ status: 'auth_required', authUrl: 'https://x' });
  });
});
