import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { AgentSpec } from '../lib/agentManager';
import { useCreateAgent } from './useCreateAgent';

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;

const spec: AgentSpec = {
  namespace: 'kagent',
  name: 'pr-reviewer',
  displayName: 'PR reviewer',
  modelConfig: 'opus-4-7',
  toolset: ['preset:read-only'],
  skills: [
    {
      name: 'pr-review',
      path: 'pr-review',
      git: {
        url: 'https://github.com/giantswarm/agent-skills',
        commit: 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1',
      },
    },
  ],
};

function renderWith(
  options: { installation?: string } = { installation: 'gazelle' },
) {
  const { installation } = options;
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
    ...renderHook(() => useCreateAgent(installation), { wrapper }),
    invalidateQueries,
  };
}

beforeEach(() => {
  callTool.mockReset();
});

describe('useCreateAgent', () => {
  it('deploys through x_agent-manager_create_agent on the installation, with the spec as given', async () => {
    callTool.mockResolvedValue({
      agent: { name: 'pr-reviewer', namespace: 'kagent' },
      manifests: { ociRepository: '', helmRelease: '', values: {} },
      created: { ociRepository: true, helmRelease: true },
      requestedBy: 'admin@lab.local',
    });
    const { result, invalidateQueries } = renderWith();

    let created;
    await act(async () => {
      created = await result.current.deploy(spec);
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_create_agent',
      spec,
      'gazelle',
    );
    expect(created).toMatchObject({ requestedBy: 'admin@lab.local' });
    // No mode and no force: the portal applies live, never overrides a refusal.
    const args = callTool.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('mode');
    expect(args).not.toHaveProperty('force');
    // The installation's kagent lists are dropped so the roster re-reads.
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['cluster', 'gazelle', 'list', 'kagent.dev'],
      }),
    );
  });

  it("surfaces the apiserver's Forbidden for a viewer in agent-manager's words", async () => {
    callTool.mockRejectedValue(
      new Error(
        'forbidden: helmreleases.helm.toolkit.fluxcd.io is forbidden: User "oidc:viewer@lab.local" cannot create resource "helmreleases" in the namespace "kagent"',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current.deploy(spec).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.failure).toEqual({
        kind: 'refused',
        code: 'forbidden',
        message: expect.stringContaining('oidc:viewer@lab.local'),
      }),
    );
  });

  it('reports a conflict for an existing name as a refusal', async () => {
    callTool.mockRejectedValue(
      new Error('conflict: agent kagent/pr-reviewer already exists'),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current.deploy(spec).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.failure).toMatchObject({
        kind: 'refused',
        code: 'conflict',
      }),
    );
  });

  it('tells a session that is not connected to agent-manager apart from a refusal', async () => {
    callTool.mockRejectedValue(
      new Error(
        'failed to connect to server agent-manager: user not authenticated to server agent-manager',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current.deploy(spec).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.failure?.kind).toBe('not-connected'),
    );
  });

  it('commits with mode: commit and returns the pull request', async () => {
    callTool.mockResolvedValue({
      pullRequestUrl: 'https://github.com/org/gitops/pull/7',
    });
    const { result } = renderWith();

    let outcome;
    await act(async () => {
      outcome = await result.current.commit(spec);
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_create_agent',
      { ...spec, mode: 'commit' },
      'gazelle',
    );
    expect(outcome).toEqual({
      pullRequestUrl: 'https://github.com/org/gitops/pull/7',
    });
  });

  it('refuses to write without an installation to reach agent-manager on', async () => {
    const { result } = renderWith({});

    await act(async () => {
      await result.current.deploy(spec).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.failure?.kind).toBe('not-connected'),
    );
    expect(callTool).not.toHaveBeenCalled();
  });
});
