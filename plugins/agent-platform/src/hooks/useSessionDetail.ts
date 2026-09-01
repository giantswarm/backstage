import { useMemo, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentSessionDetail } from '../lib/kagentSessionDetail';
import {
  PendingConfirmation,
  readPendingConfirmation,
} from '../lib/kagentHitl';
import { buildTimeline, SessionTimeline } from '../lib/kagentTimeline';
import {
  deriveSessionState,
  isAgentWorking,
  SessionState,
} from '../lib/kagentSessionState';
import {
  BASELINE_REFETCH_INTERVAL_MS,
  getSessionTasksRefetchInterval,
} from '../lib/kagentSessionPolling';

/** Query key for one session's metadata. */
export function sessionQueryKey(installation: string, sessionId: string) {
  return ['agent-platform', 'kagent', 'session', installation, sessionId];
}

/** Query key for one session's tasks (the conversation). */
export function sessionTasksQueryKey(installation: string, sessionId: string) {
  return ['agent-platform', 'kagent', 'session-tasks', installation, sessionId];
}

export type SessionDetailView = {
  /** Undefined while loading, or when the session does not exist. */
  detail?: KagentSessionDetail;
  timeline: SessionTimeline;
  /** From the most recent task; undefined for a session that never ran. */
  state?: SessionState;
  /**
   * Whether the agent is working on a reply, as of the last successful read.
   *
   * Narrower than `state.isActive`: it excludes waiting on a human, and expires
   * once the state has not moved for `ACTIVE_MAX_AGE_MS`. See `isAgentWorking`.
   */
  isAgentWorking: boolean;
  /**
   * The confirmation the agent is suspended on, when it is.
   *
   * Carried alongside `state` rather than derived from the timeline because
   * answering has to name the **task** it resumes, and a timeline item only knows
   * its index. Undefined for a session that is not waiting, and for one waiting on
   * a payload we cannot read — in which case no answer must be offered.
   */
  pendingConfirmation?: PendingConfirmation;
  /** Number of A2A tasks — the session's turn count. */
  taskCount: number;
  /**
   * Whether the conversation has ever been read.
   *
   * False means the timeline, turn count and token stats are **absent, not empty**,
   * and must not be rendered: a tasks read that fails on first load leaves them at
   * their zero values while the session read succeeds, which would otherwise show
   * "no activity", `Turns 0` and "no messages yet" over a session that has plenty.
   */
  hasConversation: boolean;
  isLoading: boolean;
  /**
   * True when the session is not readable: it does not exist, was deleted, or
   * belongs to another user. kagent answers all three with a 404 and they are not
   * distinguishable, so the page shows one "not found" state.
   */
  isNotFound: boolean;
  /** A read that failed for any other reason — worth showing the message. */
  error?: Error;
};

const EMPTY_TIMELINE: SessionTimeline = {
  items: [],
  tokens: { total: 0, prompt: 0, completion: 0 },
  skippedMessages: 0,
};

/**
 * Stands in for a 200 that carried no readable session, once one has already been
 * read. A module constant so its identity is stable across renders.
 */
const UNREADABLE_SESSION_ERROR = new Error(
  'kagent returned a session response we could not read.',
);

/**
 * Read one session: its metadata and its conversation.
 *
 * Two queries rather than one because they are two kagent endpoints serving
 * different things — the session object, and the A2A tasks that carry the
 * conversation, its state and token usage. Neither request can see the other's
 * result, so the merge happens here.
 *
 * They are deliberately **not** chained. Firing both immediately halves the
 * time-to-first-paint, and the cost of a wasted tasks request when the session
 * turns out not to exist is one 404 on a page the user explicitly navigated to.
 *
 * Both poll, on different cadences — see `lib/kagentSessionPolling.ts`. Note that
 * this leaves the two reads out of step during an active session: the conversation
 * updates on the fast tier while the header's "last activity" and the duration stat
 * come from the session read a minute behind. Both render as absolute timestamps,
 * so the lag reads as older rather than as wrong.
 */
export function useSessionDetail(
  installation: string,
  sessionId: string,
  options: { enabled?: boolean } = {},
): SessionDetailView {
  // `enabled: false` stops the intervals dead, which is the only thing that
  // actually holds off a poll landing mid-delete — see `useDeleteSession`.
  const { enabled = true } = options;
  const kagentApi = useApi(kagentApiRef);

  const sessionQuery = useQuery({
    queryKey: sessionQueryKey(installation, sessionId),
    // `?? null` matters. `getSessionDetail` resolves `undefined` for a 200 that
    // carried no readable session, and react-query rejects an `undefined` resolve
    // outright — the query lands in `error` with the message
    // `["agent-platform","kagent","session",…] data is undefined`, which is both a
    // raw query key shown to a user and a classification we cannot act on. It also
    // made the `isSuccess && !data` branch below unreachable. `null` is a value
    // react-query stores, so an empty read stays an expected outcome.
    queryFn: async () =>
      (await kagentApi.getSessionDetail(installation, sessionId)) ?? null,
    enabled,
    // A flat baseline, not the tasks' two tiers: this object is the title, the
    // agent and the timestamps, none of which move while an agent works. It polls
    // at all so a session renamed or deleted elsewhere stops looking current.
    refetchInterval: BASELINE_REFETCH_INTERVAL_MS,
  });

  const tasksQuery = useQuery({
    queryKey: sessionTasksQueryKey(installation, sessionId),
    queryFn: () => kagentApi.listSessionTasks(installation, sessionId),
    enabled,
    refetchInterval: getSessionTasksRefetchInterval,
  });

  const tasks = tasksQuery.data;

  // Parsing the whole conversation is not free, so it runs when the tasks change
  // rather than on every render (a parent re-render would otherwise rebuild every
  // item and defeat the memoization in the timeline components).
  const timeline = useMemo(
    () => (tasks ? buildTimeline(tasks) : EMPTY_TIMELINE),
    [tasks],
  );
  const state = useMemo(
    () => (tasks ? deriveSessionState(tasks) : undefined),
    [tasks],
  );

  // Judged as of the last successful read rather than `Date.now()`, which is both
  // more honest and what makes it expire at all: with `Date.now()` the answer would
  // only change when something re-rendered the page, and a turn that stalled is
  // precisely the case where the data stops changing — so a stalled agent would
  // keep claiming to work for as long as the tab stayed open. Tying it to
  // `dataUpdatedAt` re-evaluates it on every poll, and never asserts progress at a
  // moment we have no data for.
  const tasksUpdatedAt = tasksQuery.dataUpdatedAt;
  const agentWorking = useMemo(
    () => (tasks ? isAgentWorking(tasks, tasksUpdatedAt) : false),
    [tasks, tasksUpdatedAt],
  );

  const pendingConfirmation = useMemo(
    () => (tasks ? readPendingConfirmation(tasks) : undefined),
    [tasks],
  );

  // The last session we read successfully. `getSessionDetail` resolves `undefined`
  // for any 200 whose body does not parse — an expired oauth2-proxy answering with
  // an HTML sign-in page is the realistic case — and react-query stores that
  // `undefined` as the query's data, discarding what we had. Holding the previous
  // value means one malformed poll degrades to a staleness notice instead of
  // erasing a live conversation.
  const lastGoodDetail = useRef<KagentSessionDetail | undefined>(undefined);
  if (sessionQuery.data) {
    lastGoodDetail.current = sessionQuery.data;
  }
  const detail = sessionQuery.data ?? lastGoodDetail.current;

  const sessionError = (sessionQuery.error as Error | null) ?? undefined;

  // The session read is what decides "not found": the tasks endpoint 404s for the
  // same session, but it also 404s on a kagent too old to serve it, and the two
  // must not look the same to the user.
  //
  // An empty 200 only means "no such session" *before* we have read one. Once the
  // page is showing a real conversation, the same response means the answer was
  // unreadable, not that the session is gone — telling someone it "may have been
  // deleted" because a proxy served a sign-in page would be a lie. A genuine 404
  // still counts at any point, since that is how a delete elsewhere shows up.
  const isNotFound =
    (sessionQuery.isSuccess &&
      !sessionQuery.data &&
      lastGoodDetail.current === undefined) ||
    sessionError?.name === 'NotFoundError';

  const unreadableSession =
    sessionQuery.isSuccess && !sessionQuery.data && lastGoodDetail.current
      ? UNREADABLE_SESSION_ERROR
      : undefined;

  // A 404 is an expected outcome, not an error to report.
  const error = isNotFound
    ? undefined
    : (sessionError ?? (tasksQuery.error as Error | null) ?? unreadableSession);

  return {
    detail,
    timeline,
    state,
    isAgentWorking: agentWorking,
    pendingConfirmation,
    taskCount: tasks?.length ?? 0,
    hasConversation: tasks !== undefined,
    // `isNotFound` short-circuits loading, because it is decided by the session
    // read alone and the page checks `isLoading` first. Without this, a session
    // that 404s immediately — `NotFoundError` is not retried, so that read settles
    // at once — still sat behind a spinner for as long as the *tasks* request took:
    // the full retry ladder (2s/4s/8s) for a non-404 failure, or the fetch timeout
    // on an unreachable installation. The answer was already known; nothing the
    // tasks read can return would change it.
    //
    // `isLoading`, deliberately, not `isFetching`: it is false during a refetch,
    // which is what keeps a poll from flashing the spinner over a rendered page.
    isLoading: !isNotFound && (sessionQuery.isLoading || tasksQuery.isLoading),
    isNotFound,
    error,
  };
}
