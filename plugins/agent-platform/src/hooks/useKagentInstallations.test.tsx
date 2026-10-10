import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi, KagentInstallation } from '../apis/types';
import { kagentInstallationsQueryKey } from '../lib/queryKeys';
import {
  hasNegativeReachability,
  hasUnknownReachability,
  KAGENT_INSTALLATIONS_STALE_TIME_MS,
  kagentInstallationsRefetchInterval,
  kagentInstallationsStaleTime,
  NEGATIVE_REACHABILITY_STALE_TIME_MS,
  REFETCH_WHILE_UNKNOWN_MS,
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

describe('a cached answer from an earlier visit', () => {
  // The persisted cache restores `dataUpdatedAt` with the data, so seeding the
  // client with an old timestamp is what a reload after the outage looks like.
  const REACHABLE: KagentInstallation[] = [
    { name: 'gazelle', reachable: true },
  ];
  const UNREACHABLE: KagentInstallation[] = [
    { name: 'gazelle', reachable: false, reason: 'connection refused' },
  ];

  function seeded(data: KagentInstallation[], ageMs: number) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(kagentInstallationsQueryKey(), data, {
      updatedAt: Date.now() - ageMs,
    });
    return queryClient;
  }

  it('re-reads a negative answer older than the negative stale time', async () => {
    // The lab regression: "not reachable" cached while the controller was
    // down hid Usage and Sessions for the rest of the hour after it was back.
    listInstallations.mockResolvedValue(REACHABLE);

    const { result } = renderWith(
      seeded(UNREACHABLE, NEGATIVE_REACHABILITY_STALE_TIME_MS + 1_000),
    );

    // The stale negative is shown while the re-read is in flight ...
    expect(result.current.notReachable).toEqual(['gazelle']);
    // ... and replaced by the recovery.
    await waitFor(() => expect(result.current.proxied).toEqual(['gazelle']));
    expect(result.current.notReachable).toEqual([]);
    expect(listInstallations).toHaveBeenCalledTimes(1);
  });

  it('trusts a fresh negative answer for the short window', () => {
    const { result } = renderWith(seeded(UNREACHABLE, 10_000));

    expect(result.current.notReachable).toEqual(['gazelle']);
    expect(listInstallations).not.toHaveBeenCalled();
  });

  it('keeps a positive answer cached for the hour', () => {
    const { result } = renderWith(
      seeded(REACHABLE, NEGATIVE_REACHABILITY_STALE_TIME_MS * 10),
    );

    expect(result.current.proxied).toEqual(['gazelle']);
    expect(listInstallations).not.toHaveBeenCalled();
  });
});

describe('kagentInstallationsStaleTime', () => {
  it('caches a list that reports every installation reachable for the hour', () => {
    expect(
      kagentInstallationsStaleTime([{ name: 'gazelle', reachable: true }]),
    ).toBe(KAGENT_INSTALLATIONS_STALE_TIME_MS);
    expect(kagentInstallationsRefetchInterval([])).toBe(false);
  });

  it('keeps a negative answer at most two minutes, and polls for the recovery', () => {
    const list: KagentInstallation[] = [
      { name: 'gazelle', reachable: true },
      { name: 'golem', reachable: false },
    ];

    expect(kagentInstallationsStaleTime(list)).toBe(
      NEGATIVE_REACHABILITY_STALE_TIME_MS,
    );
    expect(NEGATIVE_REACHABILITY_STALE_TIME_MS).toBeLessThanOrEqual(120_000);
    expect(kagentInstallationsRefetchInterval(list)).toBe(
      NEGATIVE_REACHABILITY_STALE_TIME_MS,
    );
  });

  it("re-reads fastest while a probe is still 'unknown'", () => {
    const list: KagentInstallation[] = [
      { name: 'golem', reachable: false },
      { name: 'wombat', reachable: 'unknown' },
    ];

    expect(kagentInstallationsStaleTime(list)).toBe(REFETCH_WHILE_UNKNOWN_MS);
    expect(kagentInstallationsRefetchInterval(list)).toBe(
      REFETCH_WHILE_UNKNOWN_MS,
    );
  });

  it('leaves a foreign shape to the hook, which refetches it once', () => {
    expect(kagentInstallationsStaleTime(['gazelle'])).toBe(
      KAGENT_INSTALLATIONS_STALE_TIME_MS,
    );
    expect(kagentInstallationsRefetchInterval(undefined)).toBe(false);
  });
});

describe('hasNegativeReachability', () => {
  it('is true only when some installation is reported not reachable', () => {
    expect(hasNegativeReachability(undefined)).toBe(false);
    expect(hasNegativeReachability([{ name: 'a', reachable: true }])).toBe(
      false,
    );
    expect(hasNegativeReachability([{ name: 'a', reachable: 'unknown' }])).toBe(
      false,
    );
    expect(hasNegativeReachability([{ name: 'a', reachable: false }])).toBe(
      true,
    );
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
