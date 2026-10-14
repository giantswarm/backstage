/**
 * Whether a react-query query has no data yet and is still on its way to it:
 * fetching, or waiting to fetch or retry (`fetchStatus: 'paused'`, a retry
 * after a failed request while the tab is in the background or offline).
 *
 * `isLoading` is false while paused, so a view gated on it falls through to
 * its empty state ("No items") after a 500 whose retry waits. A disabled query
 * (`fetchStatus: 'idle'`) is not awaiting data, so `isPending` alone would
 * spin forever on it.
 */
export function isAwaitingData(query: {
  isPending: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}): boolean {
  return query.isPending && query.fetchStatus !== 'idle';
}
