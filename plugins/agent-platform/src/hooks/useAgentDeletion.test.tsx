import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useAgentDeletion } from './useAgentDeletion';

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
    ...renderHook(
      () => useAgentDeletion(installation, 'kagent', 'pr-reviewer'),
      {
        wrapper,
      },
    ),
    invalidateQueries,
  };
}

beforeEach(() => {
  callTool.mockReset();
});

describe('useAgentDeletion', () => {
  it('deletes through x_agent-manager_delete_agent on the installation, never with force, and reports what agent-manager kept', async () => {
    callTool.mockResolvedValue({
      name: 'pr-reviewer',
      namespace: 'kagent',
      helmReleaseDeleted: true,
      ociRepositoryDeleted: false,
      ociRepositoryKept:
        'still referenced by 1 other HelmRelease(s): sre-agent',
      requestedBy: 'admin@lab.local',
    });
    const { result, invalidateQueries } = renderWith();

    let outcome;
    await act(async () => {
      outcome = await result.current.deleteAgent();
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_delete_agent',
      { namespace: 'kagent', name: 'pr-reviewer' },
      'gazelle',
    );
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('force');
    expect(outcome).toMatchObject({
      helmReleaseDeleted: true,
      ociRepositoryKept:
        'still referenced by 1 other HelmRelease(s): sre-agent',
      requestedBy: 'admin@lab.local',
    });
    // The roster and the detail read are re-read rather than edited: the cache
    // is persisted, so a stale template could otherwise be rehydrated.
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['cluster', 'gazelle', 'list', 'kagent.dev'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['cluster', 'gazelle', 'get', 'kagent.dev'],
    });
  });

  it("surfaces agent-manager's refusal verbatim, with its code", async () => {
    callTool.mockRejectedValue(
      new Error(
        'conflict: HelmRelease kagent/pr-reviewer is applied by Flux Kustomization "agents": its desired state lives in git, a live write would be undone. Change it in the GitOps repository, or pass force to write anyway',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current.deleteAgent().catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.failure).toMatchObject({
        kind: 'refused',
        code: 'conflict',
      });
    });
    expect(result.current.failure?.message).toBe(
      'HelmRelease kagent/pr-reviewer is applied by Flux Kustomization "agents": its desired state lives in git, a live write would be undone. Change it in the GitOps repository, or pass force to write anyway',
    );
  });

  it("surfaces the apiserver's Forbidden for a viewer", async () => {
    callTool.mockRejectedValue(
      new Error(
        'forbidden: delete HelmRelease kagent/pr-reviewer: helmreleases.helm.toolkit.fluxcd.io "pr-reviewer" is forbidden: User "oidc:viewer@lab.local" cannot delete resource "helmreleases" in API group "helm.toolkit.fluxcd.io" in the namespace "kagent"',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current.deleteAgent().catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.failure?.code).toBe('forbidden');
    });
    expect(result.current.failure?.message).toMatch(
      /User "oidc:viewer@lab.local" cannot delete/,
    );
  });

  it('commits through delete_agent with mode: commit', async () => {
    callTool.mockResolvedValue({
      pullRequestUrl: 'https://github.com/org/gitops/pull/9',
    });
    const { result } = renderWith();

    let outcome;
    await act(async () => {
      outcome = await result.current.commit();
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_delete_agent',
      { namespace: 'kagent', name: 'pr-reviewer', mode: 'commit' },
      'gazelle',
    );
    expect(outcome).toEqual({
      pullRequestUrl: 'https://github.com/org/gitops/pull/9',
    });
  });

  it('reports a not-connected session as such', async () => {
    callTool.mockRejectedValue(
      new Error(
        'failed to connect to server agent-manager: user not authenticated to server agent-manager',
      ),
    );
    const { result } = renderWith();

    await act(async () => {
      await result.current.deleteAgent().catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.failure?.kind).toBe('not-connected');
    });
  });
});
