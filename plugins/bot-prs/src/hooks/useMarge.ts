import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  ALL_INSTALLATIONS,
  applyInstallationScope,
  useInstallationScope,
  useInstallations,
} from '@giantswarm/backstage-plugin-gs';

import {
  MargeClient,
  type MargeMarkArgs,
  type MargeRemedyArgs,
  type MargeSweepArgs,
} from '../apis/MargeClient';
import {
  MARGE_SERVER,
  MargeNotConnectedError,
  type MargeMarkResult,
  type MargeResult,
} from '../lib/marge';
import { musterMargeListQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';
import {
  useMusterServerAvailability,
  type MusterServerAvailability,
} from './useMusterServerAvailability';

/**
 * marge's tools on one installation, as the signed-in person -- `undefined`
 * without the muster plugin or without an installation.
 */
export function useMargeClient(
  installation: string | undefined,
): MargeClient | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(
    () =>
      musterApi && installation
        ? new MargeClient(musterApi, installation)
        : undefined,
    [musterApi, installation],
  );
}

/** The installations whose muster registers marge. */
export function useMargeAvailability(
  installations: string[],
): MusterServerAvailability {
  return useMusterServerAvailability(MARGE_SERVER, installations);
}

export type MargeInstallationView = {
  /** The one installation the page calls marge on, or undefined while resolving. */
  installation: string | undefined;
  /** The in-scope installations whose muster lists marge, home first. */
  candidates: string[];
  /**
   * True when the scope is "all installations" and the page picked one on
   * the person's behalf, so it can say which muster it went through.
   */
  isResolvedFromAll: boolean;
  isLoading: boolean;
  /** The muster plugin is not installed: marge is reachable nowhere. */
  isUnavailable: boolean;
};

/**
 * The single installation whose muster the page reaches marge through.
 *
 * One muster at a time, as the Usage tab does: the queue is GitHub's, not an
 * installation's, so two musters would answer the same question twice. A
 * pinned scope wins if its muster lists marge, then the home installation,
 * then the first candidate. A pinned scope whose muster has no marge resolves
 * to nothing rather than to another installation: the pin is the person's
 * choice, and the page says why it is empty.
 */
export function useMargeInstallation(): MargeInstallationView {
  const { installations, isLoading: isLoadingInstallations } =
    useInstallations();
  const { scope, home, isSingleInstallation } = useInstallationScope();

  const names = useMemo(
    () => installations.map(installation => installation.name),
    [installations],
  );
  const inScope = useMemo(
    () => applyInstallationScope(names, scope),
    [names, scope],
  );
  const availability = useMargeAvailability(inScope);
  const candidates = availability.available;

  const pinned = scope === ALL_INSTALLATIONS ? undefined : scope;
  const preferred = pinned !== undefined ? [pinned] : [home, candidates[0]];
  const listed = preferred.find(
    (name): name is string => name !== undefined && candidates.includes(name),
  );

  // A server list that could not be read says nothing about marge, so it is
  // not an answer to act on: the page calls marge on that installation and
  // reports what marge, or muster, says. Only a muster that answered without
  // marge leaves the page with no installation.
  const fallback = [pinned, home, availability.unreachable[0]].find(
    (name): name is string =>
      name !== undefined && availability.unreachable.includes(name),
  );
  const installation = listed ?? fallback;

  return {
    installation,
    candidates,
    isResolvedFromAll:
      listed !== undefined &&
      pinned === undefined &&
      !isSingleInstallation &&
      candidates.length > 1,
    isLoading: isLoadingInstallations || availability.isLoading,
    isUnavailable: availability.isUnavailable,
  };
}

/** One team's queue as the page holds it: the result, and how it was read. */
export type TeamQueue = {
  team: string;
  result: MargeResult | undefined;
  /**
   * `stored`: the classification the last sweep left in each PR's label, one
   * search. `live`: the engine classified every PR again on the person's
   * request, a check read per PR.
   */
  mode: 'stored' | 'live';
  /** Epoch ms of the read the result came from. */
  readAt: number | undefined;
  isLoading: boolean;
  error: Error | null;
};

export type BotPrsState = {
  /** One entry per team in scope, in the order given. */
  queues: TeamQueue[];
  /** True while any team's stored read is in flight. */
  isLoading: boolean;
  /** True while the live classification the person asked for is in flight. */
  isRefreshing: boolean;
  /** The first not-connected refusal, when one team's read met one. */
  notConnected: MargeNotConnectedError | undefined;
  /** The stored reads again: cheap, and what a write leaves behind. */
  reload: () => void;
  /** `refresh: true` on every team in scope: classify every PR now. An explicit action, never automatic. */
  refresh: () => void;
};

type QueueData = {
  result: MargeResult;
  mode: 'stored' | 'live';
  readAt: number;
};

/**
 * The queues of the teams in scope through one installation's marge, one
 * `x_marge_list` per team: marge takes one team per call, and the page's
 * "All teams" is the sum.
 *
 * The table is the stored read, `x_marge_list` without `refresh`, which
 * costs one search per team and reports what the last sweep decided. The
 * live read is a separate mutation behind the Refresh button, so nothing the
 * page does on mount, on focus or on a timer classifies a PR; its answer
 * replaces the stored one in the same cache entry, and stays until the next
 * read.
 */
export function useBotPrs(
  installation: string | undefined,
  teams: string[],
): BotPrsState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();
  const enabled = Boolean(client) && teams.length > 0;

  const queries = useQueries({
    queries: teams.map(team => ({
      queryKey: musterMargeListQueryKey(installation ?? '', team),
      enabled: Boolean(client),
      queryFn: async (): Promise<QueueData> => ({
        result: await client!.list(team, false),
        mode: 'stored',
        readAt: Date.now(),
      }),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const answers = await Promise.allSettled(
        teams.map(async team => ({
          team,
          data: {
            result: await client!.list(team, true),
            mode: 'live' as const,
            readAt: Date.now(),
          },
        })),
      );
      for (const answer of answers) {
        if (answer.status === 'fulfilled') {
          queryClient.setQueryData(
            musterMargeListQueryKey(installation ?? '', answer.value.team),
            answer.value.data,
          );
        }
      }
      const failed = answers.find(
        (answer): answer is PromiseRejectedResult =>
          answer.status === 'rejected',
      );
      if (failed) {
        throw failed.reason;
      }
    },
  });

  const teamsKey = teams.join(',');
  const reload = useCallback(() => {
    refresh.reset();
    for (const team of teamsKey ? teamsKey.split(',') : []) {
      queryClient.invalidateQueries({
        queryKey: musterMargeListQueryKey(installation ?? '', team),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, installation, teamsKey]);

  const queues: TeamQueue[] = teams.map((team, index) => {
    const query = queries[index];
    const data = query.data as QueueData | undefined;
    return {
      team,
      result: data?.result,
      mode: data?.mode ?? 'stored',
      readAt: data?.readAt,
      isLoading: Boolean(client) && query.isLoading,
      error: (query.error as Error | null) ?? null,
    };
  });
  const refreshError = refresh.error as Error | null;
  const notConnected = [refreshError, ...queues.map(queue => queue.error)].find(
    (error): error is MargeNotConnectedError =>
      error instanceof MargeNotConnectedError,
  );

  return {
    queues,
    isLoading: enabled && queues.some(queue => queue.isLoading),
    isRefreshing: refresh.isPending,
    notConnected,
    reload,
    refresh: () => {
      if (enabled && !refresh.isPending) {
        refresh.mutate();
      }
    },
  };
}

export type MargeRunState = {
  /** What the engine answered, dry run or not. */
  result: MargeResult | undefined;
  /** Whether `result` came from a dry run. */
  isDryRun: boolean;
  isPending: boolean;
  error: Error | null;
  run: (args: Omit<MargeSweepArgs, 'team'>) => Promise<MargeResult>;
  reset: () => void;
};

/**
 * One `x_marge_sweep` call on the team: the Preview (`dry_run: true`) and the
 * Apply, and a per-PR merge or refresh narrowed with `prs`. A run that wrote
 * invalidates the stored queue, because its mark step moved the labels.
 */
export function useMargeSweep(
  installation: string | undefined,
  team: string | undefined,
): MargeRunState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();
  const [isDryRun, setIsDryRun] = useState(true);

  const mutation = useMutation({
    mutationFn: async (args: Omit<MargeSweepArgs, 'team'>) => {
      if (!client || !team) {
        throw new Error('marge is not reachable on this installation');
      }
      setIsDryRun(Boolean(args.dry_run));
      return client.sweep({ ...args, team });
    },
    onSuccess: (_result, args) => {
      if (!args.dry_run) {
        queryClient.invalidateQueries({
          queryKey: musterMargeListQueryKey(installation ?? '', team ?? ''),
        });
      }
    },
  });

  return {
    result: mutation.data,
    isDryRun,
    isPending: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
    run: mutation.mutateAsync,
    reset: mutation.reset,
  };
}

export type MargeRemedyState = {
  result: MargeResult | undefined;
  isDryRun: boolean;
  isPending: boolean;
  error: Error | null;
  run: (args: Omit<MargeRemedyArgs, 'team'>) => Promise<MargeResult>;
  reset: () => void;
};

/**
 * `x_marge_remedy` on one PR: the catalogue rule that matches it, applied
 * through that rule's action and its guards. The dry run says which rule
 * would apply and writes nothing; the real run is the engine's classify,
 * remedy and mark steps on that PR.
 */
export function useMargeRemedy(
  installation: string | undefined,
  team: string | undefined,
): MargeRemedyState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();
  const [isDryRun, setIsDryRun] = useState(true);

  const mutation = useMutation({
    mutationFn: async (args: Omit<MargeRemedyArgs, 'team'>) => {
      if (!client || !team) {
        throw new Error('marge is not reachable on this installation');
      }
      setIsDryRun(Boolean(args.dry_run));
      return client.remedy({ ...args, team });
    },
    onSuccess: (_result, args) => {
      if (!args.dry_run) {
        queryClient.invalidateQueries({
          queryKey: musterMargeListQueryKey(installation ?? '', team ?? ''),
        });
      }
    },
  });

  return {
    result: mutation.data,
    isDryRun,
    isPending: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
    run: mutation.mutateAsync,
    reset: mutation.reset,
  };
}

export type MargeMarkState = {
  result: MargeMarkResult | undefined;
  isPending: boolean;
  error: Error | null;
  run: (args: MargeMarkArgs) => Promise<MargeMarkResult>;
  reset: () => void;
};

/** `x_marge_mark` on one PR, as the person. */
export function useMargeMark(
  installation: string | undefined,
  team: string | undefined,
): MargeMarkState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (args: MargeMarkArgs) => {
      if (!client) {
        throw new Error('marge is not reachable on this installation');
      }
      return client.mark(args);
    },
    onSuccess: (_result, args) => {
      if (!args.dry_run) {
        queryClient.invalidateQueries({
          queryKey: musterMargeListQueryKey(installation ?? '', team ?? ''),
        });
      }
    },
  });

  return {
    result: mutation.data,
    isPending: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
    run: mutation.mutateAsync,
    reset: mutation.reset,
  };
}
