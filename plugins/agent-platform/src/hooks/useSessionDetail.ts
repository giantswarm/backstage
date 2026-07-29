import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentSessionDetail } from '../lib/kagentSessionDetail';
import { buildTimeline, SessionTimeline } from '../lib/kagentTimeline';
import { deriveSessionState, SessionState } from '../lib/kagentSessionState';

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
  /** Number of A2A tasks — the session's turn count. */
  taskCount: number;
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
 */
export function useSessionDetail(
  installation: string,
  sessionId: string,
): SessionDetailView {
  const kagentApi = useApi(kagentApiRef);

  const sessionQuery = useQuery({
    queryKey: sessionQueryKey(installation, sessionId),
    queryFn: () => kagentApi.getSessionDetail(installation, sessionId),
  });

  const tasksQuery = useQuery({
    queryKey: sessionTasksQueryKey(installation, sessionId),
    queryFn: () => kagentApi.listSessionTasks(installation, sessionId),
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

  // The session read is what decides "not found": the tasks endpoint 404s for the
  // same session, but it also 404s on a kagent too old to serve it, and the two
  // must not look the same to the user.
  const isNotFound =
    (sessionQuery.isSuccess && !sessionQuery.data) ||
    (sessionQuery.error as Error | null)?.name === 'NotFoundError';

  // A 404 is an expected outcome, not an error to report.
  const error = isNotFound
    ? undefined
    : (((sessionQuery.error ?? tasksQuery.error) as Error | null) ?? undefined);

  return {
    detail: sessionQuery.data ?? undefined,
    timeline,
    state,
    taskCount: tasks?.length ?? 0,
    // `isNotFound` short-circuits loading, because it is decided by the session
    // read alone and the page checks `isLoading` first. Without this, a session
    // that 404s immediately — `NotFoundError` is not retried, so that read settles
    // at once — still sat behind a spinner for as long as the *tasks* request took:
    // the full retry ladder (2s/4s/8s) for a non-404 failure, or the fetch timeout
    // on an unreachable installation. The answer was already known; nothing the
    // tasks read can return would change it.
    isLoading: !isNotFound && (sessionQuery.isLoading || tasksQuery.isLoading),
    isNotFound,
    error,
  };
}
