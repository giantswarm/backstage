import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import type { Workspace } from '../lib/workspaceManager';
import { useWorkspaceNames, workspaceInstallations } from './useWorkspaceNames';

const listServers = jest.fn();
const listInstallations = jest.fn();
const musterApi = { listServers, listInstallations } as unknown as MusterApi;

function workspace(name: string, handle?: string): Workspace {
  return {
    name,
    organization: 'lab',
    sources: [],
    sync: { schedule: 'nightly' },
    resourceVersion: '1',
    createdAt: '2026-10-01T00:00:00Z',
    repositories: 2,
    sessions: 1,
    ...(handle && { volume: { handle } }),
  };
}

const listWorkspaces = jest.spyOn(
  WorkspaceManagerClient.prototype,
  'listWorkspaces',
);

function wrapper({ children }: PropsWithChildren<{}>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

const session = (handle: string, installation = 'lab') => ({
  installation,
  workspace: { volumeHandle: handle },
});

beforeEach(() => {
  listInstallations.mockReset();
  listInstallations.mockResolvedValue({
    installations: [
      { name: 'lab', requiresAuth: true },
      { name: 'plain', requiresAuth: true },
    ],
  });
  listServers.mockReset();
  listServers.mockImplementation(async (installation: string) => ({
    mcpServers:
      installation === 'lab'
        ? [{ name: 'agent-manager' }, { name: 'workspace-manager' }]
        : [{ name: 'agent-manager' }],
  }));
  listWorkspaces.mockReset();
  listWorkspaces.mockResolvedValue({
    workspaces: [
      workspace('ws-docs', 'fs-1::docs'),
      workspace('ws-unbound'),
      workspace('ws-code', 'fs-1::code'),
    ],
    organizations: ['lab'],
  });
});

describe('useWorkspaceNames', () => {
  it('names every session by its volume with one list per installation', async () => {
    const { result } = renderHook(() => useWorkspaceNames(['lab']), {
      wrapper,
    });

    expect(result.current(session('fs-1::docs'))).toEqual({
      status: 'loading',
    });
    await waitFor(() =>
      expect(result.current(session('fs-1::docs'))?.status).toBe('named'),
    );
    expect(result.current(session('fs-1::docs'))).toEqual({
      status: 'named',
      workspace: expect.objectContaining({ name: 'ws-docs' }),
    });
    expect(result.current(session('fs-1::code'))).toEqual({
      status: 'named',
      workspace: expect.objectContaining({ name: 'ws-code' }),
    });
    expect(listWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('leaves a volume no listed workspace has unnamed', async () => {
    const { result } = renderHook(() => useWorkspaceNames(['lab']), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current(session('fs-1::gone'))?.status).toBe('unnamed'),
    );
  });

  it('leaves a session unnamed where the list fails', async () => {
    listWorkspaces.mockRejectedValue(new Error('not a member'));
    const { result } = renderHook(() => useWorkspaceNames(['lab']), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current(session('fs-1::docs'))?.status).toBe('unnamed'),
    );
  });

  it('leaves a session unnamed where the installation lists no workspace-manager', async () => {
    const { result } = renderHook(() => useWorkspaceNames(['plain']), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current(session('fs-1::docs', 'plain'))?.status).toBe(
        'unnamed',
      ),
    );
    expect(listWorkspaces).not.toHaveBeenCalled();
  });

  it('answers nothing for a session without a workspace, and reads nothing', () => {
    const { result } = renderHook(() => useWorkspaceNames([]), { wrapper });

    expect(result.current({ installation: 'lab' })).toBeUndefined();
    expect(listServers).not.toHaveBeenCalled();
    expect(listWorkspaces).not.toHaveBeenCalled();
  });
});

describe('workspaceInstallations', () => {
  it('lists the installations of the sessions with a workspace once', () => {
    expect(
      workspaceInstallations([
        { installation: 'b', workspace: {} },
        { installation: 'a' },
        { installation: 'c', workspace: {} },
        { installation: 'b', workspace: {} },
      ]),
    ).toEqual(['b', 'c']);
  });
});
