import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useMusterServerAvailability } from './useMusterServerAvailability';

const listServers = jest.fn();
const listInstallations = jest.fn();
const musterApi = { listServers, listInstallations } as unknown as MusterApi;

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

beforeEach(() => {
  listServers.mockReset();
  listServers.mockImplementation(async (installation: string) => ({
    mcpServers: installation === 'beta' ? [] : [{ name: 'agent-manager' }],
  }));
  listInstallations.mockReset();
  listInstallations.mockResolvedValue({
    installations: [
      { name: 'alpha', requiresAuth: true },
      { name: 'beta', requiresAuth: true },
      { name: 'gamma', requiresAuth: false },
    ],
  });
});

describe('useMusterServerAvailability', () => {
  it('reads an installation without per-user sign-in as sharedIdentity, by default', async () => {
    const { result } = renderHook(
      () =>
        useMusterServerAvailability('agent-manager', [
          'alpha',
          'beta',
          'gamma',
        ]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual(['alpha']);
    expect(result.current.missing).toEqual(['beta']);
    expect(result.current.sharedIdentity).toEqual(['gamma']);
    expect(result.current.presenceOf('gamma')).toBe('sharedIdentity');
  });

  it('stays loading until the installations have answered', async () => {
    let answer: (value: unknown) => void = () => {};
    listInstallations.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      }),
    );
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['gamma']),
      { wrapper },
    );

    await waitFor(() => expect(listServers).toHaveBeenCalled());
    // gamma's server list answers first: still nothing is offered.
    await waitFor(() =>
      expect(listServers.mock.results[0]?.value).resolves.toBeDefined(),
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.presenceOf('gamma')).toBe('unknown');
    expect(result.current.available).toEqual([]);
    answer({ installations: [{ name: 'gamma', requiresAuth: false }] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual([]);
  });

  it('offers nothing when the installations cannot be read', async () => {
    listInstallations.mockRejectedValue(new Error('backend down'));
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['gamma']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presenceOf('gamma')).toBe('unknown');
    expect(result.current.available).toEqual([]);
  });

  it('reports a missing server before the shared identity, which a sign-in alone would not fix', async () => {
    listInstallations.mockResolvedValue({
      installations: [{ name: 'beta', requiresAuth: false }],
    });
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['beta']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presenceOf('beta')).toBe('missing');
  });

  it.each(['cluster-manager', 'model-manager', 'workspace-manager'])(
    'withholds %s where muster has no per-user sign-in',
    async server => {
      listServers.mockResolvedValue({ mcpServers: [{ name: server }] });
      const { result } = renderHook(
        () => useMusterServerAvailability(server, ['alpha', 'gamma']),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.available).toEqual(['alpha']);
      expect(result.current.sharedIdentity).toEqual(['gamma']);
    },
  );

  it('does not ask for the installations for a server whose tools run without the person', async () => {
    const { result } = renderHook(
      () =>
        useMusterServerAvailability('agent-manager', ['gamma'], {
          asPerson: false,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presenceOf('gamma')).toBe('available');
    expect(listInstallations).not.toHaveBeenCalled();
  });
});
