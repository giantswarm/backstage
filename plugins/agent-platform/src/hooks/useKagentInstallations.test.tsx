import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi, KagentInstallation } from '../apis/types';
import { kagentInstallationsQueryKey } from '../lib/queryKeys';
import {
  hasUnknownReachability,
  useKagentInstallations,
} from './useKagentInstallations';

const listInstallations = jest.fn();

const kagentApi = {
  listInstallations,
  listSessions: jest.fn(),
  getIdentity: jest.fn(),
} as unknown as KagentApi;

function renderWith(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    queryClient,
    ...renderHook(() => useKagentInstallations(), { wrapper }),
  };
}

const LIST: KagentInstallation[] = [
  { name: 'gazelle', reachable: true },
  { name: 'golem', reachable: false, reason: 'DNS lookup failed (ENOTFOUND)' },
  { name: 'wombat', reachable: 'unknown' },
];

beforeEach(() => {
  listInstallations.mockReset();
  listInstallations.mockResolvedValue(LIST);
});

describe('useKagentInstallations', () => {
  it('splits the backend list into proxied and not-reachable names', async () => {
    const { result } = renderWith();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.installations).toBeUndefined();
    expect(result.current.proxied).toEqual([]);
    expect(result.current.notReachable).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual(LIST);
    // 'unknown' is not a verdict: wombat is still worth a per-user call.
    expect(result.current.proxied).toEqual(['gazelle', 'wombat']);
    expect(result.current.notReachable).toEqual(['golem']);
    expect(result.current.isNotReachable('golem')).toBe(true);
    expect(result.current.isNotReachable('gazelle')).toBe(false);
    expect(result.current.isNotReachable('wombat')).toBe(false);
    expect(result.current.isNotReachable('never-heard-of-it')).toBe(false);
  });

  it('reads under the versioned key', async () => {
    const { result, queryClient } = renderWith();

    await waitFor(() => expect(result.current.installations).toEqual(LIST));

    expect(queryClient.getQueryData(kagentInstallationsQueryKey())).toEqual(
      LIST,
    );
    expect(
      queryClient.getQueryData(['agent-platform', 'kagent', 'installations']),
    ).toBeUndefined();
  });

  it('treats a foreign shape under its key as not answered and fetches once', async () => {
    // The cache is persisted across releases: whatever an older or newer portal
    // wrote under this key must read as "nothing yet", not as installations.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(kagentInstallationsQueryKey(), [
      'gazelle',
      'golem',
    ]);

    const { result } = renderWith(queryClient);

    // The stale entry is never exposed as a list ...
    expect(result.current.installations).toBeUndefined();
    expect(result.current.proxied).toEqual([]);
    expect(result.current.notReachable).toEqual([]);

    // ... and is replaced by one fetch of the real thing.
    await waitFor(() => expect(result.current.installations).toEqual(LIST));
    expect(listInstallations).toHaveBeenCalledTimes(1);
  });

  it('reports a failed backend call instead of inventing a list', async () => {
    listInstallations.mockRejectedValue(new Error('backend down'));

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.installations).toBeUndefined();
    expect(result.current.notReachable).toEqual([]);
  });

  it('keeps a stable result identity across unrelated renders', async () => {
    const { result, rerender } = renderWith();
    await waitFor(() => expect(result.current.installations).toEqual(LIST));

    const before = result.current;
    rerender();

    expect(result.current).toBe(before);
  });
});

describe('hasUnknownReachability', () => {
  it("is true only while some installation is 'unknown'", () => {
    expect(hasUnknownReachability(undefined)).toBe(false);
    expect(hasUnknownReachability([])).toBe(false);
    expect(
      hasUnknownReachability([
        { name: 'gazelle', reachable: true },
        { name: 'golem', reachable: false },
      ]),
    ).toBe(false);
    expect(
      hasUnknownReachability([
        { name: 'gazelle', reachable: true },
        { name: 'wombat', reachable: 'unknown' },
      ]),
    ).toBe(true);
  });
});
