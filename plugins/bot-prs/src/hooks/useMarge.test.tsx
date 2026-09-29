import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import {
  MargeAnswerLostError,
  MargeNotConnectedError,
  type MargeResult,
} from '../lib/marge';
import { musterMargeListScopeKey } from '../lib/queryKeys';
import {
  useBotPrs,
  useMargeMark,
  useMargeServerName,
  useMargeTeamSweeps,
} from './useMarge';

/** What Chrome's fetch rejects with when the connection closes under it. */
const connectionLost = () =>
  new TypeError('Failed to fetch (devportal.giantswarm.io)');

/** The several-team answer of `list`, from one result per team. */
const queuesOf = (byTeam: Record<string, MargeResult | string>) => ({
  teams: Object.entries(byTeam).map(([team, answer]) =>
    typeof answer === 'string'
      ? { team, error: answer }
      : { team, result: answer },
  ),
});

const callTool = jest.fn();
const listServers = jest.fn();
const musterApi = { callTool, listServers } as unknown as MusterApi;

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
  listServers.mockReset();
});

describe('useBotPrs', () => {
  it('reads every team in one call and never refreshes on its own', async () => {
    callTool.mockResolvedValue(queuesOf({ bumblebee: stored, atlas: stored }));
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
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_list',
      { teams: ['bumblebee', 'atlas'], refresh: false },
      'gazelle',
    );
  });

  it('refuses an answer that is not the several-team shape', async () => {
    // A marge that does not take `teams` ignores it and answers the query
    // scope: every bot PR the person can see, under no team at all.
    callTool.mockResolvedValue(stored);
    const { result } = renderHook(() => useBotPrs('gazelle', ['bumblebee']), {
      wrapper: wrapperWith(client()),
    });

    await waitFor(() => expect(result.current.queues[0].error).toBeTruthy());
    expect(result.current.queues[0].error?.message).toMatch(/one team a call/);
    expect(result.current.queues[0].result).toBeUndefined();
  });

  it('classifies only when asked, and writes the class to each label', async () => {
    callTool
      .mockResolvedValueOnce(queuesOf({ bumblebee: stored, atlas: stored }))
      .mockResolvedValueOnce(live)
      .mockResolvedValueOnce(live)
      .mockResolvedValue(queuesOf({ bumblebee: live, atlas: live }));
    const queryClient = client();
    const { result } = renderHook(
      () => useBotPrs('gazelle', ['bumblebee', 'atlas']),
      { wrapper: wrapperWith(queryClient) },
    );
    await waitFor(() =>
      expect(result.current.queues[0].result).toEqual(stored),
    );

    act(() => result.current.classify());

    // One sweep per team, not one call naming both: a marge that does not
    // take a team list would read a team list as the query scope and write
    // to every bot PR the person can see.
    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_marge_sweep',
        { team: 'bumblebee', actions: 'classify', dry_run: false },
        'gazelle',
      ),
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_sweep',
      { team: 'atlas', actions: 'classify', dry_run: false },
      'gazelle',
    );

    // The labels carry the answer now, so the stored read is read again
    // rather than the live answer being kept in the cache.
    await waitFor(() => expect(result.current.queues[0].result).toEqual(live));
    expect(callTool).toHaveBeenLastCalledWith(
      'x_marge_list',
      { teams: ['bumblebee', 'atlas'], refresh: false },
      'gazelle',
    );
  });

  it('reports a failed classification and reloads the stored read anyway', async () => {
    callTool
      .mockResolvedValueOnce(queuesOf({ bumblebee: stored }))
      .mockRejectedValueOnce(new Error('marge refused: rate limited'))
      .mockResolvedValue(queuesOf({ bumblebee: stored }));
    const { result } = renderHook(() => useBotPrs('gazelle', ['bumblebee']), {
      wrapper: wrapperWith(client()),
    });
    await waitFor(() =>
      expect(result.current.queues[0].result).toEqual(stored),
    );

    act(() => result.current.classify());

    await waitFor(() => expect(result.current.classifyError).toBeTruthy());
    expect(result.current.classifyError?.message).toMatch(/rate limited/);
    expect(result.current.isClassifying).toBe(false);
  });

  it('reports a lost classification as lost, and reads the labels again', async () => {
    callTool
      .mockResolvedValueOnce(queuesOf({ bumblebee: stored }))
      .mockRejectedValueOnce(connectionLost())
      .mockResolvedValue(queuesOf({ bumblebee: live }));
    const { result } = renderHook(() => useBotPrs('gazelle', ['bumblebee']), {
      wrapper: wrapperWith(client()),
    });
    await waitFor(() =>
      expect(result.current.queues[0].result).toEqual(stored),
    );

    act(() => result.current.classify());

    await waitFor(() =>
      expect(result.current.classifyError).toBeInstanceOf(MargeAnswerLostError),
    );
    // marge may have written the labels before the answer was lost, so the
    // stored read is the answer.
    await waitFor(() => expect(result.current.queues[0].result).toEqual(live));
  });

  it('reports a refusal ahead of a lost answer when two teams fail apart', async () => {
    callTool.mockImplementation((tool: string, args: { team?: string }) => {
      if (tool === 'x_marge_list') {
        return Promise.resolve(queuesOf({ bumblebee: stored, atlas: stored }));
      }
      return Promise.reject(
        args.team === 'bumblebee'
          ? connectionLost()
          : new Error('marge refused: rate limited'),
      );
    });
    const { result } = renderHook(
      () => useBotPrs('gazelle', ['bumblebee', 'atlas']),
      { wrapper: wrapperWith(client()) },
    );
    await waitFor(() =>
      expect(result.current.queues[0].result).toEqual(stored),
    );

    act(() => result.current.classify());

    await waitFor(() => expect(result.current.classifyError).toBeTruthy());
    expect(result.current.classifyError?.message).toMatch(/rate limited/);
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
    callTool.mockResolvedValue(
      queuesOf({ bumblebee: stored, atlas: 'no team file for "atlas"' }),
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
    expect(result.current.queues[1].result).toBeUndefined();
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

describe('useMargeTeamSweeps', () => {
  it('calls marge once per team with that team\u2019s PRs, and invalidates only on a write', async () => {
    callTool.mockResolvedValue(live);
    const queryClient = client();
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMargeTeamSweeps('gazelle'), {
      wrapper: wrapperWith(queryClient),
    });

    await act(async () => {
      await result.current.run({
        teams: ['bumblebee', 'atlas', 'rocket'],
        prsByTeam: {
          bumblebee: ['giantswarm/backstage#2250'],
          atlas: [],
          rocket: ['giantswarm/mimir#7'],
        },
        actions: 'approve,merge,mark',
        dryRun: true,
      });
    });

    // The team with no PR is not called at all.
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_sweep',
      {
        team: 'bumblebee',
        prs: ['giantswarm/backstage#2250'],
        actions: 'approve,merge,mark',
        dry_run: true,
      },
      'gazelle',
    );
    await waitFor(() =>
      expect(result.current.runs.map(run => run.team)).toEqual([
        'bumblebee',
        'rocket',
      ]),
    );
    expect(result.current.isDryRun).toBe(true);
    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.run({
        teams: ['bumblebee'],
        prsByTeam: { bumblebee: ['giantswarm/backstage#2250'] },
        actions: 'approve,merge,mark',
        dryRun: false,
      });
    });
    await waitFor(() => expect(result.current.isDryRun).toBe(false));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: musterMargeListScopeKey('gazelle'),
    });
  });

  it('keeps one team\u2019s refusal to that team, and reports a missing grant as one', async () => {
    callTool.mockImplementation((_tool, args: { team: string }) =>
      args.team === 'atlas'
        ? Promise.reject(new MargeNotConnectedError('not signed in'))
        : Promise.resolve(live),
    );
    const { result } = renderHook(() => useMargeTeamSweeps('gazelle'), {
      wrapper: wrapperWith(client()),
    });

    await act(async () => {
      await result.current.run({
        teams: ['bumblebee', 'atlas'],
        prsByTeam: {
          bumblebee: ['giantswarm/backstage#2250'],
          atlas: ['giantswarm/mimir#7'],
        },
        actions: 'approve,merge,mark',
        dryRun: true,
      });
    });

    await waitFor(() => expect(result.current.runs).toHaveLength(2));
    expect(result.current.runs[0].result).toEqual(live);
    expect(result.current.runs[0].error).toBeNull();
    expect(result.current.runs[1].result).toBeUndefined();
    expect(result.current.notConnected).toBeInstanceOf(MargeNotConnectedError);
  });

  it('runs a lost preview again for its team alone, keeping every other answer', async () => {
    callTool.mockImplementation((_tool, args: { team: string }) =>
      args.team === 'atlas'
        ? Promise.reject(connectionLost())
        : Promise.resolve(live),
    );
    const { result } = renderHook(() => useMargeTeamSweeps('gazelle'), {
      wrapper: wrapperWith(client()),
    });

    await act(async () => {
      await result.current.run({
        teams: ['bumblebee', 'atlas'],
        prsByTeam: {
          bumblebee: ['giantswarm/backstage#2250'],
          atlas: ['giantswarm/mimir#7'],
        },
        actions: 'approve,merge,mark',
        dryRun: true,
      });
    });
    await waitFor(() =>
      expect(result.current.runs[1].error).toBeInstanceOf(MargeAnswerLostError),
    );

    callTool.mockClear();
    callTool.mockResolvedValue(stored);
    await act(async () => {
      await result.current.retry(['atlas']);
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_sweep',
      {
        team: 'atlas',
        prs: ['giantswarm/mimir#7'],
        actions: 'approve,merge,mark',
        dry_run: true,
      },
      'gazelle',
    );
    await waitFor(() =>
      expect(result.current.runs).toEqual([
        { team: 'bumblebee', result: live, error: null },
        { team: 'atlas', result: stored, error: null },
      ]),
    );
    expect(result.current.isDryRun).toBe(true);
  });

  it('reads the stored queue again after an apply whose answer was lost', async () => {
    callTool.mockRejectedValue(connectionLost());
    const queryClient = client();
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMargeTeamSweeps('gazelle'), {
      wrapper: wrapperWith(queryClient),
    });

    await act(async () => {
      await result.current.run({
        teams: ['bumblebee'],
        prsByTeam: { bumblebee: ['giantswarm/backstage#2250'] },
        actions: 'approve,merge,mark',
        dryRun: false,
      });
    });

    await waitFor(() =>
      expect(result.current.runs[0]?.error).toBeInstanceOf(
        MargeAnswerLostError,
      ),
    );
    expect(result.current.isDryRun).toBe(false);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: musterMargeListScopeKey('gazelle'),
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
    const { result } = renderHook(() => useMargeMark('gazelle'), {
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

describe('useMargeServerName', () => {
  it('names the server muster registers, not the prefix its tools carry', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'gazelle-mcp-marge', toolPrefix: 'marge' }],
    });

    const { result } = renderHook(() => useMargeServerName('gazelle'), {
      wrapper: wrapperWith(client()),
    });

    await waitFor(() => expect(result.current).toBe('gazelle-mcp-marge'));
  });

  it('stands on the exposed name while the server list has not answered', () => {
    listServers.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useMargeServerName('gazelle'), {
      wrapper: wrapperWith(client()),
    });

    expect(result.current).toBe('marge');
  });
});
