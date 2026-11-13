import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { musterApiRef, type MusterApi } from '../apis';

import type { Query } from '@tanstack/react-query';
import {
  unavailableBackoff,
  useMusterServerAvailability,
} from './useMusterServerAvailability';

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
    expect(result.current.failedOf('gamma')).toBe(true);
  });

  it('says a server list failed only once its read has failed', async () => {
    let fail: (error: Error) => void = () => {};
    listServers.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['alpha']),
      { wrapper },
    );

    await waitFor(() => expect(listServers).toHaveBeenCalled());
    expect(result.current.presenceOf('alpha')).toBe('unknown');
    expect(result.current.failedOf('alpha')).toBe(false);

    fail(new Error('muster down'));
    await waitFor(() => expect(result.current.failedOf('alpha')).toBe(true));
    expect(result.current.presenceOf('alpha')).toBe('unknown');
  });

  it('says nothing failed for an installation muster answered', async () => {
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['alpha']),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.presenceOf('alpha')).toBe('available'),
    );
    expect(result.current.failedOf('alpha')).toBe(false);
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

describe('an installation the portal cannot reach', () => {
  it('is offered nowhere, and not asked for its list once the installations said so', async () => {
    listInstallations.mockResolvedValue({
      installations: [
        { name: 'alpha', requiresAuth: true, reachable: true },
        {
          name: 'garm',
          requiresAuth: true,
          reachable: false,
          reason: 'no answer within 3000 ms',
        },
      ],
    });
    const { result } = renderHook(
      () => useMusterServerAvailability('agent-manager', ['alpha', 'garm']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.available).toEqual(['alpha']);
    expect(result.current.presenceOf('garm')).toBe('unknown');
    expect(result.current.unreachable).toEqual(['garm']);
    expect(result.current.failedOf('garm')).toBe(true);
    expect(result.current.failedOf('alpha')).toBe(false);
    // At most the read started beside `/installations`, before it answered.
    await result.current.recheck();
    expect(
      listServers.mock.calls.filter(([name]) => name === 'garm').length,
    ).toBeLessThanOrEqual(1);
  });

  it('is not read again by every component that mounts after a 503', async () => {
    listServers.mockRejectedValue(
      Object.assign(new Error('garm did not answer'), {
        name: 'ServiceUnavailableError',
        status: 503,
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const shared = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    const first = renderHook(
      () => useMusterServerAvailability('agent-manager', ['garm']),
      { wrapper: shared },
    );
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    const second = renderHook(
      () => useMusterServerAvailability('agent-manager', ['garm']),
      { wrapper: shared },
    );
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(listServers).toHaveBeenCalledTimes(1);
  });
});

it('reads a list that failed with something other than a 503 again on the next mount', async () => {
  listServers.mockRejectedValueOnce(
    Object.assign(new Error('timeout'), { status: 504 }),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const shared = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  const first = renderHook(
    () => useMusterServerAvailability('agent-manager', ['alpha']),
    { wrapper: shared },
  );
  await waitFor(() => expect(first.result.current.isLoading).toBe(false));
  first.unmount();

  const second = renderHook(
    () => useMusterServerAvailability('agent-manager', ['alpha']),
    { wrapper: shared },
  );

  await waitFor(() =>
    expect(second.result.current.presenceOf('alpha')).toBe('available'),
  );
  expect(listServers).toHaveBeenCalledTimes(2);
});

describe('unavailableBackoff', () => {
  const query = (state: Partial<Query<unknown, Error>['state']>) =>
    ({ state }) as Query<unknown, Error>;
  const unavailable = Object.assign(new Error('x'), { status: 503 });

  it.each([
    [1, 60_000],
    [2, 120_000],
    [4, 480_000],
    [5, 600_000],
    [9, 600_000],
  ])('reads again after a 503 number %s in %s ms', (count, delay) => {
    expect(
      unavailableBackoff(
        query({ status: 'error', error: unavailable, errorUpdateCount: count }),
      ),
    ).toBe(delay);
  });

  it('starts the doubling over after a successful read', () => {
    const shared = query({
      status: 'success',
      error: null,
      errorUpdateCount: 3,
    });
    expect(unavailableBackoff(shared)).toBe(false);
    Object.assign(shared.state, {
      status: 'error',
      error: unavailable,
      errorUpdateCount: 4,
    });
    expect(unavailableBackoff(shared)).toBe(60_000);
  });

  it.each([
    ['another failure', { status: 'error' as const, error: new Error('x') }],
    ['a list', { status: 'success' as const, error: null }],
  ])('leaves %s alone', (_label, state) => {
    expect(unavailableBackoff(query({ ...state, errorUpdateCount: 1 }))).toBe(
      false,
    );
  });
});
