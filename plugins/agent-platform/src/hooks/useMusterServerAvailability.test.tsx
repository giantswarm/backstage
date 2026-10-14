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
  it('reads an installation without per-user sign-in as sharedIdentity for a server reached as the person', async () => {
    const { result } = renderHook(
      () =>
        useMusterServerAvailability(
          'agent-manager',
          ['alpha', 'beta', 'gamma'],
          { asPerson: true },
        ),
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
      () =>
        useMusterServerAvailability('agent-manager', ['gamma'], {
          asPerson: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(listServers).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);
    answer({ installations: [{ name: 'gamma', requiresAuth: false }] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual([]);
  });

  it('leaves the server lists to decide when the installations cannot be read', async () => {
    listInstallations.mockRejectedValue(new Error('backend down'));
    const { result } = renderHook(
      () =>
        useMusterServerAvailability('agent-manager', ['gamma'], {
          asPerson: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presenceOf('gamma')).toBe('available');
  });

  it('does not ask for the installations without asPerson', async () => {
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['gamma']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presenceOf('gamma')).toBe('available');
    expect(listInstallations).not.toHaveBeenCalled();
  });
});
