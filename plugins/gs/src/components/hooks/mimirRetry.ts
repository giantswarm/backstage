import {
  isPermanentReadError,
  pollingQueryOptions,
  type PollingQueryOptions,
} from '@giantswarm/backstage-plugin-ui-react';

// Error names `MimirClient` sets from the response status that are terminal
// for a Mimir query on top of a 401 and a 403 (`isPermanentReadError`): a
// query Mimir refused (400) and a missing tenant or endpoint (404).
const MIMIR_TERMINAL_ERROR_NAMES: readonly unknown[] = [
  'InputError',
  'NotFoundError',
];

/**
 * Whether a Mimir query failed for good: a 400, 401, 403 or 404, which
 * asking again answers the same way. Neither retried nor polled again.
 */
export function isTerminalMimirError(error: unknown): boolean {
  return (
    isPermanentReadError(error) ||
    MIMIR_TERMINAL_ERROR_NAMES.includes(
      (error as { name?: unknown } | null)?.name,
    )
  );
}

/**
 * The retry policy of every Mimir query: once, and never after a terminal
 * error ({@link isTerminalMimirError}).
 *
 * A slow Mimir times out the backend's proxy after 30 s, and react-query's
 * default of three retries turns one such moment into four logged failures
 * for every query of a page load. One retry still covers a transient blip.
 */
export function mimirQueryRetry(failureCount: number, error: Error): boolean {
  return failureCount < 1 && !isTerminalMimirError(error);
}

/**
 * The polling options of a Mimir query that polls (`refetchInterval`): not
 * from a hidden tab, not after a terminal error ({@link isTerminalMimirError});
 * nothing where it does not poll. The queries keep a 30 s `staleTime`, so a
 * return to the tab reads only what is older than that.
 */
export function mimirPollingOptions(
  refetchInterval: number | false | undefined,
): Partial<PollingQueryOptions> {
  return refetchInterval
    ? pollingQueryOptions(refetchInterval, {
        stopOnError: isTerminalMimirError,
      })
    : {};
}
