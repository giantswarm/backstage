import type { QueryClient } from '@tanstack/react-query';
import type { KagentApi } from '../apis/types';
import { sessionsQueryKey } from './queryKeys';

/**
 * Read one installation's sessions again, once, into the shared query: the
 * person's "Try again" after a failed read.
 *
 * One attempt, not the client's retry policy (three more with a growing
 * backoff): a press against a kagent that is still down answers in one
 * request's time, rather than spinning for a quarter of a minute to report
 * what the first attempt already knew. The outcome lands on the query, so
 * every reader of the list sees it; the rejection is the query's error and is
 * swallowed here.
 */
export function readSessionsOnce(
  queryClient: QueryClient,
  kagentApi: KagentApi,
  installation: string,
): Promise<void> {
  return queryClient
    .fetchQuery({
      queryKey: sessionsQueryKey(installation),
      queryFn: () => kagentApi.listSessions(installation),
      retry: false,
      staleTime: 0,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
