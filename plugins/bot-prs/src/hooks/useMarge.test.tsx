import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { MargeNotConnectedError, type MargeResult } from '../lib/marge';
import { musterMargeListQueryKey } from '../lib/queryKeys';
import { useBotPrs, useMargeMark, useMargeSweep } from './useMarge';

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;

const summary = {
  total: 1,
  merged: 0,
  auto_merge: 0,
  remedied: 0,
  failed: 0,
  security_failures: 0,
  ci_unavailable: 0,
  ci_no_verdict: 0,
  stale: 0,
  refreshed: 0,
  cancelled: 0,
  retried: 0,
  obsolete: 0,
  waiting: 0,
  skipped: 0,
  eligible: 0,
  unclassified: 1,
};

const stored: MargeResult = {
  summary,
  unclassified: [
    {
      owner: 'giantswarm',
      repo: 'backstage',
      number: 2250,
      title: 'Update dependency typescript to v7',
      url: 'https://github.com/giantswarm/backstage/pull/2250',
      status: 'Unclassified',
      detail: 'no sweep has classified this PR',
    },
  ],
};

const live: MargeResult = {
  summary: { ...summary, unclassified: 0, eligible: 1 },
  eligible: [
    { ...stored.unclassified![0], status: 'Eligible', detail: 'green' },
  ],
};

function wrapperWith(queryClient: QueryClient) {
  return ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

const client = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

beforeEach(() => {
  callTool.mockReset();
});

describe('useBotPrs', () => {
  it('reads the stored classification of every team on mount and never refreshes on its own', async () => {
    callTool.mockResolvedValue(stored);
    const { result } = renderHook(
      () => useBotPrs('gazelle', ['bumblebee', 'atlas']),
      { wrapper: wrapperWith(client()) },
    );

    await waitFor(() =>
      expect(result.current.queues.map(queue => queue.result)).toEqual([
        stored,
        stored,
      ]),
    );
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_list',
      { team: 'bumblebee', refresh: false },
      'gazelle',
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_list',
      { team: 'atlas', refresh: false },
      'gazelle',
    );
    expect(result.current.queues.map(queue => queue.mode)).toEqual([
      'stored',
      'stored',
    ]);
  });

  it('classifies live only when asked, and keeps that answer as the queue', async () => {
    callTool.mockResolvedValueOnce(stored).mockResolvedValueOnce(live);
    const queryClient = client();
    const { result } = renderHook(() => useBotPrs('gazelle', ['bumblebee']), {
      wrapper: wrapperWith(queryClient),
    });
    await waitFor(() =>
      expect(result.current.queues[0].result).toEqual(stored),
    );

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.queues[0].mode).toBe('live'));
    expect(callTool).toHaveBeenLastCalledWith(
      'x_marge_list',
      { team: 'bumblebee', refresh: true },
      'gazelle',
    );
    expect(result.current.queues[0].result).toEqual(live);
    expect(
      queryClient.getQueryData(musterMargeListQueryKey('gazelle', 'bumblebee')),
    ).toMatchObject({ mode: 'live', result: live });
  });

  it("reports muster's not-connected answer as such, for the sign-in gate", async () => {
    callTool.mockRejectedValue(new Error('tool not found: x_marge_list'));
    const { result } = renderHook(() => useBotPrs('gazelle', ['bumblebee']), {
      wrapper: wrapperWith(client()),
    });
    await waitFor(() => expect(result.current.notConnected).toBeDefined());
    expect(result.current.notConnected).toBeInstanceOf(MargeNotConnectedError);
  });

  it('keeps a team refusal to that team', async () => {
    callTool.mockImplementation((_tool, args: { team: string }) =>
      args.team === 'atlas'
        ? Promise.reject(new Error('no team file for "atlas"'))
        : Promise.resolve(stored),
    );
    const { result } = renderHook(
      () => useBotPrs('gazelle', ['bumblebee', 'atlas']),
      { wrapper: wrapperWith(client()) },
    );
    await waitFor(() =>
      expect(result.current.queues[1].error?.message).toBe(
        'no team file for "atlas"',
      ),
    );
    expect(result.current.queues[0].result).toEqual(stored);
    expect(result.current.notConnected).toBeUndefined();
  });

  it('does nothing without a team', () => {
    const { result } = renderHook(() => useBotPrs('gazelle', []), {
      wrapper: wrapperWith(client()),
    });
    expect(result.current.isLoading).toBe(false);
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe('useMargeSweep', () => {
  it('previews with dry_run and applies without it, invalidating the stored queue only on a write', async () => {
    callTool.mockResolvedValue(live);
    const queryClient = client();
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMargeSweep('gazelle', 'bumblebee'), {
      wrapper: wrapperWith(queryClient),
    });

    await act(async () => {
      await result.current.run({ dry_run: true, actions: 'approve,mark' });
    });
    expect(callTool).toHaveBeenLastCalledWith(
      'x_marge_sweep',
      { team: 'bumblebee', dry_run: true, actions: 'approve,mark' },
      'gazelle',
    );
    expect(result.current.isDryRun).toBe(true);
    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.run({
        prs: ['giantswarm/backstage#2250'],
        actions: 'approve,merge,mark',
      });
    });
    expect(callTool).toHaveBeenLastCalledWith(
      'x_marge_sweep',
      {
        team: 'bumblebee',
        prs: ['giantswarm/backstage#2250'],
        actions: 'approve,merge,mark',
      },
      'gazelle',
    );
    expect(result.current.isDryRun).toBe(false);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: musterMargeListQueryKey('gazelle', 'bumblebee'),
    });
  });
});

describe('useMargeMark', () => {
  it('writes the marker with the arguments it was given and passes the answer on', async () => {
    const written = {
      owner: 'giantswarm',
      repo: 'backstage',
      number: 2250,
      outcome: 'blocked',
      tool: 'developer-portal',
      head_sha: 'abc1234def',
      at: '2026-09-17T10:00:00Z',
      dry_run: false,
      change_id: 'typescript@v7',
    };
    callTool.mockResolvedValue(written);
    const { result } = renderHook(() => useMargeMark('gazelle', 'bumblebee'), {
      wrapper: wrapperWith(client()),
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.run({
        pr_url: 'giantswarm/backstage#2250',
        outcome: 'blocked',
        reason: 'waits on upstream',
        tool: 'developer-portal',
      });
    });
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_mark',
      {
        pr_url: 'giantswarm/backstage#2250',
        outcome: 'blocked',
        reason: 'waits on upstream',
        tool: 'developer-portal',
      },
      'gazelle',
    );
    expect(outcome).toEqual(written);
  });
});
