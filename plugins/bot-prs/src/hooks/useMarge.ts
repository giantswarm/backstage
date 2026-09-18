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
  CLASSIFY_ACTIONS,
  MARGE_SERVER,
  MargeNotConnectedError,
  type MargeMarkResult,
  type MargeResult,
  type MargeTeamQueues,
} from '../lib/marge';
import {
  musterMargeListQueryKey,
  musterMargeListScopeKey,
} from '../lib/queryKeys';
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

/**
 * The name this installation's muster registers marge under, for the sign-in
 * and the auth status, which name a server and not a tool. muster declares
 * marge with a `toolPrefix`, so the CR name (`gazelle-mcp-marge`) and the
 * exposed name (`marge`) differ, and a call under the exposed one is refused.
 * The exposed name stands until the server list answers, so an installation
 * whose muster registers marge under its own name still signs in.
 */
export function useMargeServerName(installation: string | undefined): string {
  const installations = useMemo(
    () => (installation ? [installation] : []),
    [installation],
  );
  const availability = useMargeAvailability(installations);
  return (
    (installation && availability.registeredNameOf(installation)) ||
    MARGE_SERVER
  );
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
  /** True while the classification the person asked for is in flight. */
  isClassifying: boolean;
  /** The teams whose classification has not answered yet. */
  classifying: string[];
  /** Why the classification failed, when it did. */
  classifyError: Error | null;
  /** The first not-connected refusal, when one team's read met one. */
  notConnected: MargeNotConnectedError | undefined;
  /** The stored reads again: cheap, and what a write leaves behind. */
  reload: () => void;
  /**
   * Classify every PR in scope now and write the class to its label, one
   * `x_marge_sweep` per team with `classify` as the only step. An explicit
   * action, never automatic.
   */
  classify: () => void;
};

type QueueData = {
  queues: MargeTeamQueues;
  readAt: number;
};

/**
 * The queues of the teams in scope through one installation's marge, in one
 * `x_marge_list` call: the engine merges the teams' repository lists and
 * reads them once, so a scope of every team costs one listing and not one
 * per team.
 *
 * The table is the stored read, `x_marge_list` without `refresh`, which
 * reports what the last sweep decided. Classifying is a separate mutation
 * behind its own button, so nothing the page does on mount, on focus or on a
 * timer classifies a PR. It is a write: `x_marge_sweep` with `classify` as
 * its only step leaves the class in each PR's `marge/<class>` label, so the
 * next stored read, a teammate's page and the CLI all report what it decided.
 */
export function useBotPrs(
  installation: string | undefined,
  teams: string[],
): BotPrsState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();
  const enabled = Boolean(client) && teams.length > 0;
  const teamsKey = teams.join(',');
  const queryKey = musterMargeListQueryKey(installation ?? '', teams);

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async (): Promise<QueueData> => ({
      queues: await client!.listTeams(teams, false),
      readAt: Date.now(),
    }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // One sweep per team, not one call with every team: a marge that does not
  // take a team list would read this as the query scope and classify every
  // bot PR the person can see. A read can be refused after the fact; a
  // write cannot.
  const [classifying, setClassifying] = useState<string[]>([]);
  const classifyRun = useMutation({
    mutationFn: async () => {
      setClassifying(teams);
      const answers = await Promise.allSettled(
        teams.map(team =>
          client!
            .sweep({ team, actions: CLASSIFY_ACTIONS, dry_run: false })
            .finally(() =>
              setClassifying(current =>
                current.filter(pending => pending !== team),
              ),
            ),
        ),
      );
      const failed = answers.find(
        (answer): answer is PromiseRejectedResult =>
          answer.status === 'rejected',
      );
      if (failed) {
        throw failed.reason;
      }
    },
    onSettled: () => {
      setClassifying([]);
      // Whatever the run wrote is in the labels now, so the stored read is
      // the answer -- including for a team whose own call failed.
      queryClient.invalidateQueries({
        queryKey: musterMargeListScopeKey(installation ?? ''),
      });
    },
  });

  const reload = useCallback(() => {
    classifyRun.reset();
    queryClient.invalidateQueries({
      queryKey: musterMargeListScopeKey(installation ?? ''),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, installation, teamsKey]);

  // A call that failed says nothing about one team: the whole read failed,
  // so every team carries that error and the page reports it once. A team's
  // own error is marge's answer about that team alone.
  const failure = (query.error as Error | null) ?? null;
  const answers = new Map(
    (query.data?.queues.teams ?? []).map(entry => [entry.team, entry]),
  );
  const queues: TeamQueue[] = teams.map(team => {
    const answer = answers.get(team);
    return {
      team,
      result: answer?.result,
      readAt: query.data?.readAt,
      isLoading: enabled && query.isLoading,
      error: failure ?? (answer?.error ? new Error(answer.error) : null),
    };
  });
  const classifyError = (classifyRun.error as Error | null) ?? null;
  const notConnected = [classifyError, failure].find(
    (error): error is MargeNotConnectedError =>
      error instanceof MargeNotConnectedError,
  );

  return {
    queues,
    isLoading: enabled && query.isLoading,
    isClassifying: classifyRun.isPending,
    classifying,
    classifyError:
      classifyError instanceof MargeNotConnectedError ? null : classifyError,
    notConnected,
    reload,
    classify: () => {
      if (enabled && !classifyRun.isPending) {
        classifyRun.mutate();
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
          queryKey: musterMargeListScopeKey(installation ?? ''),
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

/** One team's answer inside a run that covered several teams. */
export type TeamSweepRun = {
  team: string;
  result: MargeResult | undefined;
  error: Error | null;
};

export type MargeTeamSweepsState = {
  /** One entry per team the last run covered, in the order given. */
  runs: TeamSweepRun[];
  /** Whether `runs` came from a dry run. */
  isDryRun: boolean;
  isPending: boolean;
  /** The first not-connected refusal, when one team's call met one. */
  notConnected: MargeNotConnectedError | undefined;
  run: (args: TeamSweepArgs) => Promise<TeamSweepRun[]>;
  reset: () => void;
};

/** What one several-team run asks for. */
export type TeamSweepArgs = {
  /** The teams to sweep, each under its own policy. */
  teams: string[];
  /**
   * The PRs to act on, per team. A team named here with no PR is not
   * called; a team absent from it is swept whole.
   */
  prsByTeam?: Record<string, string[]>;
  actions: string;
  dryRun: boolean;
};

/**
 * One `x_marge_sweep` per team, as one action of the page.
 *
 * A team file decides what its PRs may become, so a run over several teams
 * is several calls, one per team, each narrowed with `prs` when the caller
 * named PRs. One team's refusal is that team's own
 * outcome and leaves the others alone, so the dialog reports per team. A run
 * that wrote invalidates every team it touched: its mark step moved the
 * labels the stored read shows.
 */
export function useMargeTeamSweeps(
  installation: string | undefined,
): MargeTeamSweepsState {
  const client = useMargeClient(installation);
  const queryClient = useQueryClient();
  const [isDryRun, setIsDryRun] = useState(true);

  const mutation = useMutation({
    mutationFn: async (args: TeamSweepArgs): Promise<TeamSweepRun[]> => {
      if (!client) {
        throw new Error('marge is not reachable on this installation');
      }
      setIsDryRun(args.dryRun);
      const narrowed = args.prsByTeam;
      const teams = args.teams.filter(
        team => !narrowed || (narrowed[team]?.length ?? 0) > 0,
      );
      const answers = await Promise.allSettled(
        teams.map(team =>
          client.sweep({
            team,
            prs: narrowed?.[team],
            actions: args.actions,
            dry_run: args.dryRun,
          }),
        ),
      );
      return teams.map((team, index) => {
        const answer = answers[index];
        return {
          team,
          result: answer.status === 'fulfilled' ? answer.value : undefined,
          error:
            answer.status === 'rejected'
              ? ((answer.reason as Error | undefined) ??
                new Error('the sweep failed'))
              : null,
        };
      });
    },
    onSuccess: (_runs, args) => {
      if (args.dryRun) {
        return;
      }
      queryClient.invalidateQueries({
        queryKey: musterMargeListScopeKey(installation ?? ''),
      });
    },
  });

  const runs = (mutation.data as TeamSweepRun[] | undefined) ?? [];
  const notConnected = [
    mutation.error as Error | null,
    ...runs.map(run => run.error),
  ].find(
    (error): error is MargeNotConnectedError =>
      error instanceof MargeNotConnectedError,
  );

  return {
    runs,
    isDryRun,
    isPending: mutation.isPending,
    notConnected,
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
          queryKey: musterMargeListScopeKey(installation ?? ''),
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
export function useMargeMark(installation: string | undefined): MargeMarkState {
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
          queryKey: musterMargeListScopeKey(installation ?? ''),
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
