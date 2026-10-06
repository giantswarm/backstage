import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { roadmapApiRef } from '@giantswarm/backstage-plugin-roadmap';
import { plansApiRef } from '../apis';
import { ALL_TEAMS } from '../lib/hive';
import { EpicPlans, epicPlansOf, IssueRef, RepoEpics } from '../lib/epic';
import { HistoryWindow, Lane, MagazineCard } from '../lib/magazine';
import { useHiveHistory, useHiveNow } from './useHive';

/**
 * Hive's epic page joins three sources per epic, each read through the hook
 * the view it replaces uses: the roadmap board item (fields, body,
 * sub-issues), the plans that name the epic in their `**Epic:**` header,
 * and the magazine's card and history group for the epic's issue.
 */

/** The board item behind `/hive/epics/:id`. */
export function useEpicItem(id: string | undefined) {
  const roadmapApi = useApi(roadmapApiRef);
  return useQuery({
    queryKey: ['roadmap', 'item', id],
    queryFn: () => roadmapApi.getItem(id!),
    enabled: !!id,
  });
}

/** Every plan repository's epic references: merged plans and open PRs. */
export function usePlanEpics() {
  const plansApi = useApi(plansApiRef);
  return useQuery({
    queryKey: ['plans', 'epics', 'all'],
    queryFn: async (): Promise<RepoEpics[]> => {
      const { repositories } = await plansApi.listRepos();
      return Promise.all(
        repositories.map(async repo => ({
          repo,
          ...(await plansApi.listEpics(repo)),
        })),
      );
    },
    staleTime: 5 * 60_000,
  });
}

/** The plans of one epic, open ones first. */
export function useEpicPlans(issue: IssueRef | undefined): {
  plans: EpicPlans;
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = usePlanEpics();
  return {
    plans: epicPlansOf(data ?? [], issue),
    isLoading,
    error,
  };
}

/** The epic's card on Now and its lane, across every team. */
export function useEpicCard(key: string | undefined): {
  card?: MagazineCard;
  lane?: Lane;
  isLoading: boolean;
} {
  const { data, isLoading } = useHiveNow(ALL_TEAMS);
  const lane = data?.lanes.find(candidate =>
    candidate.cards.some(card => card.key === key),
  );
  return {
    card: lane?.cards.find(card => card.key === key),
    lane,
    isLoading,
  };
}

/** The epic's group in one history window, if it moved in it. */
export function useEpicHistory(window: HistoryWindow, key: string | undefined) {
  const query = useHiveHistory(window, ALL_TEAMS);
  return {
    ...query,
    group: query.data?.groups.find(group => group.key === key),
  };
}

/**
 * The board item a plan PR's epic is, for sending an old plan link to its
 * epic's Plan tab: `undefined` while loading, `null` for a plan without an
 * epic (or an epic the board does not hold).
 */
export function usePullEpicItemId(
  pullNumber: number,
  repo: string | undefined,
): string | null | undefined {
  const roadmapApi = useApi(roadmapApiRef);
  const epics = usePlanEpics();
  const pull = epics.data
    ?.filter(entry => !repo || entry.repo === repo)
    .flatMap(entry => entry.pulls)
    .find(candidate => candidate.number === pullNumber);
  const items = useQuery({
    queryKey: ['roadmap', 'items', {}],
    queryFn: () => roadmapApi.listItems({}),
    enabled: !!pull,
  });
  if (epics.isLoading) {
    return undefined;
  }
  if (!pull) {
    return null;
  }
  if (items.isLoading) {
    return undefined;
  }
  const { owner, repo: epicRepo, number } = pull.epic;
  const item = items.data?.items.find(
    candidate =>
      candidate.repo === `${owner}/${epicRepo}` && candidate.number === number,
  );
  return item?.id ?? null;
}
