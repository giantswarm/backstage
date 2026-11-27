import { useQueries } from '@tanstack/react-query';

import type { ReviewsClient } from '../apis/ReviewsClient';
import { GithubRateLimitError, type PrRow, type PrState } from '../lib/github';
import { reviewQueueQueryKey, SEARCH_STALE_MS } from './useReviewSections';

/** How often a row reads again after GitHub's rate refusal, and from when. */
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_RETRY_MS = 15_000;
const SHORT_RESET_MS = 60_000;

function isShortRateLimit(error: Error): boolean {
  return (
    error instanceof GithubRateLimitError &&
    (!error.resetAt || error.resetAt.getTime() - Date.now() <= SHORT_RESET_MS)
  );
}

export type PrStateEntry = {
  state: PrState | undefined;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Each row's CI, review and merge state, while `enabled`. A PR is read once
 * however many sections list it (the query is keyed by the PR), kept as long
 * as the searches are, and read again by Refresh. CI finishing or the base
 * branch moving changes the state without touching the PR's `updated_at`, so
 * that is no key.
 */
export function usePrStates(
  client: ReviewsClient | undefined,
  rows: readonly PrRow[],
  enabled: boolean,
): Map<string, PrStateEntry> {
  const results = useQueries({
    queries: rows.map(row => ({
      queryKey: [...reviewQueueQueryKey(client?.installation), 'state', row.id],
      queryFn: ({ signal }) => client!.prState(row, signal),
      enabled: Boolean(client) && enabled,
      staleTime: SEARCH_STALE_MS,
      // GitHub's secondary limit (no reset time, or one within a minute)
      // passes soon: the row keeps loading and reads again, at most three
      // times. A spent hourly budget does not: the row shows why at once.
      retry: (failures: number, error: Error) =>
        isShortRateLimit(error) && failures < RATE_LIMIT_RETRIES,
      retryDelay: (failures: number, error: Error) =>
        error instanceof GithubRateLimitError && error.resetAt
          ? Math.max(error.resetAt.getTime() - Date.now(), 1_000)
          : RATE_LIMIT_RETRY_MS * 2 ** failures,
    })),
  });
  const states = new Map<string, PrStateEntry>();
  rows.forEach((row, index) => {
    const result = results[index];
    states.set(row.id, {
      state: result.data,
      isLoading: result.isPending && result.fetchStatus !== 'idle',
      error: result.error,
    });
  });
  return states;
}
