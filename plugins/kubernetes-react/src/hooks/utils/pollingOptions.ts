import type { Query } from '@tanstack/react-query';
import { pollingQueryOptions } from '@giantswarm/backstage-plugin-ui-react';
import type { QueryOptions } from '../types';

/**
 * The caller's query options, and where they poll (`refetchInterval`), the
 * portal's polling rule (`pollingQueryOptions`): not from a hidden tab — a
 * read as it becomes visible again instead — and not after a 401 or 403,
 * which a cluster answers the same way until the person's access changes. A
 * 404 keeps polling: a page that polls for a resource it just created waits
 * through it.
 */
export function withPollingRule<T>(
  queryOptions: QueryOptions<T> = {},
): QueryOptions<T> & {
  refetchIntervalInBackground?: boolean;
  refetchOnWindowFocus?: boolean;
} {
  const { refetchInterval } = queryOptions;
  if (refetchInterval === undefined || refetchInterval === false) {
    return queryOptions;
  }
  return { ...queryOptions, ...pollingQueryOptions<Query<T>>(refetchInterval) };
}
