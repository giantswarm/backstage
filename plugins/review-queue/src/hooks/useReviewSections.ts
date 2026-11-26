import { useCallback, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import type { ReviewsClient } from '../apis/ReviewsClient';
import {
  GithubNotConnectedError,
  GithubRateLimitError,
  requestQuery,
  rowOf,
  sectionQuery,
  teamLabelOf,
  teamSectionSlugs,
  type Filters,
  type PrRow,
  type SearchAnswer,
  type SectionId,
} from '../lib/github';
import { matchesSearch } from '../lib/format';

/** How long a search answer is fresh: tab switches within it read no GitHub. */
export const SEARCH_STALE_MS = 2 * 60_000;

export function reviewQueueQueryKey(installation: string | undefined) {
  return ['review-queue', installation ?? ''] as const;
}

export type ReviewSection = {
  /** `waiting`, `mine`, `reviewed`, or `team:<slug>`. */
  key: string;
  kind: SectionId;
  title: string;
  /** The search, for "more on GitHub". */
  query: string;
  /** The rows as they came, the bots the search could not drop left out. */
  rows: PrRow[] | undefined;
  /** What GitHub counts for the search, less the bots left out; more than `rows` past one page. */
  total: number | undefined;
  /** Whether the section reads each PR's state without being asked. */
  eagerState: boolean;
  isLoading: boolean;
  error: Error | null;
};

export type ReviewSectionsState = {
  sections: ReviewSection[];
  /** Who each "Waiting on me" request names: `you` or a team, by PR id. */
  requestedOf: Map<string, string[]>;
  /** The person's sign-in to `github` is missing. */
  notConnected: GithubNotConnectedError | undefined;
  /** GitHub refuses the person's token for rate; the latest reset any refusal named. */
  rateLimit: GithubRateLimitError | undefined;
  /** Epoch ms of the oldest answer the tab shows. */
  readAt: number | undefined;
  isRefreshing: boolean;
  refresh: () => void;
};

/**
 * What GitHub counts for a search, less the bots the page left out. A Hive
 * search narrows only the page read, so then the count is what it shows.
 */
function totalOf(
  answer: SearchAnswer | undefined,
  unsearched: PrRow[] | undefined,
  rows: PrRow[] | undefined,
  search: string,
): number | undefined {
  if (!answer || !unsearched || !rows) {
    return undefined;
  }
  if (search) {
    return rows.length;
  }
  return answer.total_count - (answer.items.length - unsearched.length);
}

type SearchSpec = {
  key: string;
  kind: SectionId | 'request';
  title: string;
  query: string;
  eagerState: boolean;
};

function sectionSpecs(
  filters: Filters,
  hiveTeam: string,
  myTeams: readonly string[],
): SearchSpec[] {
  const specs: SearchSpec[] = [
    {
      key: 'waiting',
      kind: 'waiting',
      title: 'Waiting on me',
      query: sectionQuery('waiting', filters),
      eagerState: true,
    },
    {
      key: 'mine',
      kind: 'mine',
      title: 'My PRs awaiting review',
      query: sectionQuery('mine', filters),
      eagerState: true,
    },
    {
      key: 'reviewed',
      kind: 'reviewed',
      title: 'Reviewed by me, still open',
      query: sectionQuery('reviewed', filters),
      eagerState: false,
    },
  ];
  for (const slug of teamSectionSlugs(hiveTeam, myTeams)) {
    specs.push({
      key: `team:${slug}`,
      kind: 'team',
      title: `Waiting on ${teamLabelOf(slug)}`,
      query: sectionQuery('team', filters, slug),
      eagerState: false,
    });
  }
  return specs;
}

function requestSpecs(filters: Filters, myTeams: readonly string[]) {
  return [
    { tag: 'you', query: requestQuery({ kind: 'you' }, filters) },
    ...myTeams.map(slug => ({
      tag: slug,
      query: requestQuery({ kind: 'team', slug }, filters),
    })),
  ];
}

/**
 * Every section's search, as the signed-in person: one search per section,
 * however many PRs it holds, and one per team under "All teams". "Waiting on
 * me" adds one search for requests that name you and one per team of yours,
 * to tag its rows, which GitHub's short form of a PR does not.
 */
export function useReviewSections(
  client: ReviewsClient | undefined,
  filters: Filters,
  hiveTeam: string,
  myTeams: readonly string[],
  /** Hive's header search (`?q=`); the rows are narrowed to it on the page. */
  search = '',
): ReviewSectionsState {
  const queryClient = useQueryClient();
  const baseKey = reviewQueueQueryKey(client?.installation);
  const specs = useMemo(
    () => sectionSpecs(filters, hiveTeam, myTeams),
    [filters, hiveTeam, myTeams],
  );
  const searchOptions = (query: string, enabled = true) => ({
    queryKey: [...baseKey, 'search', query],
    queryFn: () => client!.search(query),
    enabled: Boolean(client) && enabled,
    staleTime: SEARCH_STALE_MS,
  });

  const results = useQueries({
    queries: specs.map(spec => searchOptions(spec.query)),
  });

  const waitingTotal = results[0]?.data?.total_count ?? 0;
  const requests = useMemo(
    () => requestSpecs(filters, myTeams),
    [filters, myTeams],
  );
  const requestResults = useQueries({
    queries: requests.map(spec => searchOptions(spec.query, waitingTotal > 0)),
  });

  const requestedOf = new Map<string, string[]>();
  requestResults.forEach((result, index) => {
    for (const item of result.data?.items ?? []) {
      const id = rowOf(item).id;
      requestedOf.set(id, [
        ...(requestedOf.get(id) ?? []),
        requests[index].tag,
      ]);
    }
  });

  const sections: ReviewSection[] = specs.map((spec, index) => {
    const result = results[index];
    const answer: SearchAnswer | undefined = result.data;
    const unsearched = answer?.items
      .map(rowOf)
      .filter(row => !(filters.hideBots && row.isBot));
    const rows = search
      ? unsearched?.filter(row => matchesSearch(row, search))
      : unsearched;
    return {
      key: spec.key,
      kind: spec.kind as SectionId,
      title: spec.title,
      query: spec.query,
      eagerState: spec.eagerState,
      rows,
      // The bots dropped here are out of GitHub's count too.
      total: totalOf(answer, unsearched, rows, search),
      isLoading: result.isPending && result.fetchStatus !== 'idle',
      error: result.error,
    };
  });

  const errors = [...results, ...requestResults]
    .map(result => result.error)
    .filter((error): error is Error => Boolean(error));
  const notConnected = errors.find(
    (error): error is GithubNotConnectedError =>
      error instanceof GithubNotConnectedError,
  );
  const rateLimits = errors.filter(
    (error): error is GithubRateLimitError =>
      error instanceof GithubRateLimitError,
  );
  const rateLimit = rateLimits.reduce<GithubRateLimitError | undefined>(
    (latest, error) =>
      !latest ||
      (error.resetAt?.getTime() ?? 0) > (latest.resetAt?.getTime() ?? 0)
        ? error
        : latest,
    undefined,
  );

  const readTimes = results
    .map(result => result.dataUpdatedAt)
    .filter(time => time > 0);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: baseKey });
    // baseKey is derived from the installation alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, client?.installation]);

  return {
    sections,
    requestedOf,
    notConnected,
    rateLimit,
    readAt: readTimes.length > 0 ? Math.min(...readTimes) : undefined,
    isRefreshing: [...results, ...requestResults].some(
      result => result.isFetching,
    ),
    refresh,
  };
}
