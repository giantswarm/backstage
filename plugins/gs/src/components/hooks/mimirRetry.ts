// Error names `MimirClient` sets from the response status. None of them can
// turn into a success by asking again.
const TERMINAL_ERROR_NAMES = [
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
];

/**
 * The retry policy of every Mimir query: once, and never after a 401, 403 or
 * 404.
 *
 * A slow Mimir times out the backend's proxy after 30 s, and react-query's
 * default of three retries turns one such moment into four logged failures
 * for every query of a page load. One retry still covers a transient blip.
 */
export function mimirQueryRetry(failureCount: number, error: Error): boolean {
  return failureCount < 1 && !TERMINAL_ERROR_NAMES.includes(error.name);
}
