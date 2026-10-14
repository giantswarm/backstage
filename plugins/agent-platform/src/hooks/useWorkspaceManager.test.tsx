import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import {
  useWorkspaceManagerAvailability,
  useWorkspaceManagerClient,
} from './useWorkspaceManager';

const listServers = jest.fn();
const listInstallations = jest.fn();
const musterApi = { listServers, listInstallations } as unknown as MusterApi;

function wrapperFor(withMuster: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren<{}>) => {
    const inner = (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return withMuster ? (
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        {inner}
      </TestApiProvider>
    ) : (
      <TestApiProvider apis={[]}>{inner}</TestApiProvider>
    );
  };
}

beforeEach(() => {
  listInstallations.mockReset();
  listInstallations.mockResolvedValue({
    installations: [
      { name: 'lab', requiresAuth: true },
      { name: 'other', requiresAuth: true },
      { name: 'shared', requiresAuth: false },
    ],
  });
  listServers.mockReset();
  listServers.mockImplementation(async (installation: string) => ({
    mcpServers:
      installation === 'lab' || installation === 'shared'
        ? [{ name: 'agent-manager' }, { name: 'workspace-manager' }]
        : [{ name: 'agent-manager' }],
  }));
});

describe('useWorkspaceManagerAvailability', () => {
  it('reports available where the muster lists workspace-manager', async () => {
    const { result } = renderHook(
      () => useWorkspaceManagerAvailability('lab'),
      { wrapper: wrapperFor(true) },
    );

    expect(result.current.presence).toBe('unknown');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      presence: 'available',
      isAvailable: true,
      isLoading: false,
    });
    expect(listServers).toHaveBeenCalledWith('lab');
  });

  it('reports sharedIdentity, not available, where the muster has no per-user sign-in', async () => {
    const { result } = renderHook(
      () => useWorkspaceManagerAvailability('shared'),
      { wrapper: wrapperFor(true) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presence).toBe('sharedIdentity');
    expect(result.current.isAvailable).toBe(false);
  });

  it('reports unavailable where the muster lists no workspace-manager', async () => {
    const { result } = renderHook(
      () => useWorkspaceManagerAvailability('other'),
      { wrapper: wrapperFor(true) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presence).toBe('missing');
    expect(result.current.isAvailable).toBe(false);
  });

  it('reports unavailable while the muster cannot be read', async () => {
    listServers.mockRejectedValue(new Error('muster is not reachable'));
    const { result } = renderHook(
      () => useWorkspaceManagerAvailability('lab'),
      { wrapper: wrapperFor(true) },
    );

    await waitFor(() => expect(listServers).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presence).toBe('unknown');
    expect(result.current.isAvailable).toBe(false);
  });

  it('reports unavailable without an installation or the muster plugin', () => {
    const none = renderHook(() => useWorkspaceManagerAvailability(undefined), {
      wrapper: wrapperFor(true),
    });
    expect(none.result.current.isAvailable).toBe(false);

    const noMuster = renderHook(() => useWorkspaceManagerAvailability('lab'), {
      wrapper: wrapperFor(false),
    });
    expect(noMuster.result.current.isAvailable).toBe(false);
    expect(listServers).not.toHaveBeenCalled();
  });
});

describe('useWorkspaceManagerClient', () => {
  it('is a client for the installation, and none without one', () => {
    const { result } = renderHook(() => useWorkspaceManagerClient('lab'), {
      wrapper: wrapperFor(true),
    });
    expect(result.current).toBeInstanceOf(WorkspaceManagerClient);
    expect(result.current?.installation).toBe('lab');

    const none = renderHook(() => useWorkspaceManagerClient(undefined), {
      wrapper: wrapperFor(true),
    });
    expect(none.result.current).toBeUndefined();
  });
});
