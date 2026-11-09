/**
 * The part of a react-query `Query` the polling rule reads. A `Query` of any
 * data and error type fits it, so the options below drop into any `useQuery`
 * or `useQueries` entry.
 */
export type PollingQuery<TData = unknown> = {
  state: {
    status: string;
    // `Error`, react-query's default error type: a query that spreads these
    // options keeps inferring it.
    error: Error | null;
    data?: TData;
  };
};

/**
 * How often a query polls: a fixed interval in milliseconds, `false` for not
 * at all, or a function of the query (a faster rate while something is on its
 * way, say).
 */
export type PollInterval<TQuery extends PollingQuery = PollingQuery> =
  number | false | ((query: TQuery) => number | false | undefined);

export type PollingQueryOptions<TQuery extends PollingQuery = PollingQuery> = {
  refetchInterval: (query: TQuery) => number | false | undefined;
  refetchIntervalInBackground: false;
  refetchOnWindowFocus: true;
};

/**
 * `error` and the errors it was made from (`cause`): the plugins wrap the
 * errors of their clients in their own and keep the original as the cause.
 */
function* causeChain(error: unknown): Generator<unknown> {
  let current = error;
  for (let depth = 0; current && depth < 5; depth++) {
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

/**
 * The error names that say a read failed for good: a 401 or a 403 as the
 * portal's clients name them (`UnauthorizedError`, `ForbiddenError`; a
 * Backstage backend's `AuthenticationError`, `NotAllowedError`), and a
 * backend's answer that the person's muster session is not connected to the
 * server it calls through (`MusterServerNotConnectedError`).
 */
const PERMANENT_ERROR_NAMES: readonly unknown[] = [
  'UnauthorizedError',
  'ForbiddenError',
  'AuthenticationError',
  'NotAllowedError',
  'MusterServerNotConnectedError',
];

/**
 * Whether a failed read gets the same answer however often it is asked, until
 * the person does something about it: a 401 — for a read through muster,
 * above all its `server_sign_in_required`, the person not signed in to the
 * server — a 403 (the person's permissions), or a server the person's muster
 * session is not connected to ({@link PERMANENT_ERROR_NAMES}). Read from the
 * error's name and status and those of its `cause` chain, never from the
 * message text.
 */
export function isPermanentReadError(error: unknown): boolean {
  for (const candidate of causeChain(error)) {
    const { name, status } = candidate as { name?: unknown; status?: unknown };
    if (
      PERMANENT_ERROR_NAMES.includes(name) ||
      status === 401 ||
      status === 403
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The options a polling query spreads into its entry, so every poll in the
 * portal follows the same two rules:
 *
 * - **Not from a hidden tab.** Nothing polls while the tab is in the
 *   background (`refetchIntervalInBackground: false`). When it becomes
 *   visible again, a read whose data is stale is made at once
 *   (`refetchOnWindowFocus: true` per query, over the clients'
 *   `refetchOnWindowFocus: false`); one that is not stale yet is read at the
 *   next tick, as if the tab had stayed in front. The person looking at the
 *   page again sees it current within seconds, and a tab left open in the
 *   background calls nothing.
 * - **Not after a permanent error.** Once the last read failed with an error
 *   `stopOnError` calls permanent ({@link isPermanentReadError} unless said
 *   otherwise), the interval stops: asking again gets the same answer. It
 *   resumes by itself once a read succeeds again — the page's sign-in
 *   invalidating the query, the tab becoming visible again, a remount.
 *
 * A poll that has a concrete reason to run in a hidden tab (waiting for a
 * sign-in that completes in another tab) sets `refetchIntervalInBackground`
 * after the spread, with the reason in a comment beside it.
 */
export function pollingQueryOptions<TQuery extends PollingQuery = PollingQuery>(
  interval: PollInterval<TQuery>,
  {
    stopOnError = isPermanentReadError,
  }: { stopOnError?: (error: unknown) => boolean } = {},
): PollingQueryOptions<TQuery> {
  return {
    refetchInterval: query => {
      if (query.state.status === 'error' && stopOnError(query.state.error)) {
        return false;
      }
      return typeof interval === 'function' ? interval(query) : interval;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  };
}
