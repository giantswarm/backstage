import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  /** The in-scope installations whose muster answered without marge. */
  missing: string[];
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
  const installation = preferred.find(
    (name): name is string => name !== undefined && candidates.includes(name),
  );

  return {
    installation,
    candidates,
    missing: availability.missing,
    isResolvedFromAll:
      installation !== undefined &&
      pinned === undefined &&
      !isSingleInstallation &&
      candidates.length > 1,
    isLoading: isLoadingInstallations || availability.isLoading,
    isUnavailable: availability.isUnavailable,
  };
}

export type BotPrsState = {
  result: MargeResult | undefined;
  /**
   * `stored`: the classification the last sweep left in each PR's label,
   * one search. `live`: the engine classified every PR again on the person's
   * request, a check read per PR.
   */
  mode: 'stored' | 'live';
  /** Epoch ms of the read the result came from. */
  readAt: number | undefined;
  isLoading: boolean;
  /** True while the live classification the person asked for is in flight. */
  isRefreshing: boolean;
  error: Error | null;
  /** The stored read again: cheap, and what a write leaves behind. */
  reload: () => void;
  /** `refresh: true`: classify every PR now. An explicit action, never automatic. */
  refresh: () => void;
};

/**
 * A team's queue through one installation's marge.
 *
 * The table is the stored read: `x_marge_list` without `refresh`, which costs
 * one search and reports what the last sweep decided. The live read is a
 * separate mutation behind the Refresh button, so nothing the page does on
 * mount, on focus or on a timer classifies a PR; its answer replaces the
 * stored one in the same cache entry, and stays until the next read.
 */
export function useBotPrs(
  installation: string | undefined,
  team: string | undefined,
): BotPrsState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();
  const queryKey = musterMargeListQueryKey(installation ?? '', team ?? '');
  const enabled = Boolean(client && team);

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async () => ({
      result: await client!.list(team!, false),
      mode: 'stored' as const,
      readAt: Date.now(),
    }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: async () => ({
      result: await client!.list(team!, true),
      mode: 'live' as const,
      readAt: Date.now(),
    }),
    onSuccess: data => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  const reload = useCallback(() => {
    refresh.reset();
    queryClient.invalidateQueries({ queryKey });
    // The key is captured by its parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, installation, team]);

  return {
    result: query.data?.result,
    mode: query.data?.mode ?? 'stored',
    readAt: query.data?.readAt,
    isLoading: enabled && query.isLoading,
    isRefreshing: refresh.isPending,
    error: ((refresh.error ?? query.error) as Error | null) ?? null,
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
