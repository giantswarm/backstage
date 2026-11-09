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
  refetchIntervalInBackground: boolean;
  /** Left out with `refetchOnVisible: false`: the client's own setting then. */
  refetchOnWindowFocus?: (query: TQuery) => boolean;
};

export type PollingRuleOptions = {
  /**
   * Errors of the caller's own that stop the poll; {@link isPermanentReadError}
   * by default.
   */
  stopOnError?: (error: unknown) => boolean;
  /**
   * Poll from a hidden tab too. Only with a concrete reason, written in a
   * comment beside it, and only while that reason holds (computed per render:
   * something on its way that the page acts on without anybody looking).
   */
  inBackground?: boolean;
  /**
   * Read the query as the tab becomes visible again, where its data is stale
   * (default). `false` for a query whose data is always stale (`staleTime`
   * 0) on a client that keeps focus refetches off: every return to the tab
   * would read it, and the next tick does it anyway.
   */
  refetchOnVisible?: boolean;
};

/**
 * `error` and the errors it was made from (`cause`): the plugins wrap the
 * errors of their clients in their own and keep the original as the cause.
 * Five deep at most, so a cycle ends.
 */
export function* causeChain(error: unknown): Generator<unknown> {
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
 *   visible again, a polling read whose data is stale is made at once
 *   (`refetchOnWindowFocus` per query, over the clients' `false`); one that
 *   is not stale yet is read at the next tick, as if the tab had stayed in
 *   front. A tab left open in the background calls nothing. `inBackground`
 *   keeps a poll going there while the caller has a concrete reason.
 * - **Not after a permanent error.** Once the last read failed with an error
 *   `stopOnError` calls permanent ({@link isPermanentReadError} unless said
 *   otherwise), the interval stops, and so does the read on becoming
 *   visible: asking again gets the same answer, and for a read through
 *   muster each call makes it create another sign-in challenge. It resumes
 *   once a read succeeds again: the page's sign-in invalidating the query,
 *   a remount.
 *
 * A query whose interval returned `false` by itself (a build that finished,
 * a watch that settled) is not read on becoming visible either.
 */
export function pollingQueryOptions<TQuery extends PollingQuery = PollingQuery>(
  interval: PollInterval<TQuery>,
  {
    stopOnError = isPermanentReadError,
    inBackground = false,
    refetchOnVisible = true,
  }: PollingRuleOptions = {},
): PollingQueryOptions<TQuery> {
  const refetchInterval = (query: TQuery) => {
    if (query.state.status === 'error' && stopOnError(query.state.error)) {
      return false;
    }
    return typeof interval === 'function' ? interval(query) : interval;
  };
  const polls = (query: TQuery) => {
    const next = refetchInterval(query);
    return typeof next === 'number' && next > 0;
  };
  return {
    refetchInterval,
    refetchIntervalInBackground: inBackground,
    ...(refetchOnVisible ? { refetchOnWindowFocus: polls } : {}),
  };
}
