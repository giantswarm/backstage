import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../lib/kagentSessionPolling';
import {
  sessionQueryKey,
  sessionTasksQueryKey,
  useSessionDetail,
} from './useSessionDetail';

const getSessionDetail = jest.fn();
const listSessionTasks = jest.fn();

const kagentApi = {
  getSessionDetail,
  listSessionTasks,
} as unknown as KagentApi;

function notFoundError() {
  const error = new Error('session not found');
  error.name = 'NotFoundError';
  return error;
}

/** A tasks read that never settles, standing in for a slow installation. */
function neverSettles() {
  return new Promise(() => {});
}

const SESSION = {
  session: {
    id: 'gazelle/abc',
    sessionId: 'abc',
    installation: 'gazelle',
    title: 'Chat',
  },
};

/** One A2A task, enough for `buildTimeline` and the polling predicate. */
function workingTask() {
  return {
    id: 'task-1',
    contextId: 'abc',
    kind: 'task',
    status: { state: 'working', timestamp: new Date().toISOString() },
    history: [
      {
        role: 'user',
        parts: [{ kind: 'text', text: 'hello' }],
        kind: 'message',
      },
    ],
  };
}

function renderHookWith(options?: { enabled?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useSessionDetail('gazelle', 'abc', options), {
      wrapper,
    }),
    queryClient,
  };
}

function renderWith() {
  return renderHookWith();
}

beforeEach(() => {
  getSessionDetail.mockReset();
  listSessionTasks.mockReset();
});

describe('useSessionDetail', () => {
  it('reports not found when kagent has no such session', async () => {
    // 404 covers deleted, never-existed and belongs-to-someone-else alike.
    getSessionDetail.mockRejectedValue(notFoundError());
    listSessionTasks.mockRejectedValue(notFoundError());

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    // An expected outcome, not something to report as a read failure.
    expect(result.current.error).toBeUndefined();
  });

  it('stops loading as soon as the session is known to be missing', async () => {
    // The session read decides "not found" on its own, and the page checks
    // `isLoading` first — so leaving loading true until the *tasks* read settles
    // kept the user on a spinner for the whole retry ladder, or for the fetch
    // timeout on an unreachable installation, with the answer already known.
    getSessionDetail.mockRejectedValue(notFoundError());
    listSessionTasks.mockImplementation(neverSettles);

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps loading while a readable session’s tasks are still in flight', async () => {
    // The other side of that short-circuit: with the session present there is
    // nothing to show until its conversation arrives.
    getSessionDetail.mockResolvedValue(SESSION);
    listSessionTasks.mockImplementation(neverSettles);

    const { result } = renderWith();

    await waitFor(() => expect(getSessionDetail).toHaveBeenCalled());
    expect(result.current.isNotFound).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('keeps the conversation on a failed refetch', async () => {
    // Now that these reads poll, a single failure is no longer "we have nothing":
    // react-query keeps `data` and sets `error`, and the plugin's client does not
    // retry ServiceUnavailable/Unauthorized/Forbidden. The page renders from
    // `detail`, so this is what stops one proxy hiccup blanking a live session.
    getSessionDetail.mockResolvedValue(SESSION);
    listSessionTasks
      .mockResolvedValueOnce([workingTask()])
      .mockRejectedValue(new Error('proxy hiccup'));

    const { result, queryClient } = renderWith();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const itemCount = result.current.timeline.items.length;
    expect(itemCount).toBeGreaterThan(0);

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: sessionTasksQueryKey('gazelle', 'abc'),
      });
    });

    // Through `waitFor`: react-query batches its notifications, so the render
    // carrying the failure lands a tick after `refetchQueries` resolves.
    await waitFor(() =>
      expect(result.current.error?.message).toBe('proxy hiccup'),
    );
    expect(result.current.detail).toBeDefined();
    expect(result.current.timeline.items).toHaveLength(itemCount);
    expect(result.current.isLoading).toBe(false);
  });

  it('reports not found when the session is deleted elsewhere', async () => {
    // A poll is now how the page learns that someone deleted this session in
    // another client — it must reach the not-found state, not the error one.
    getSessionDetail
      .mockResolvedValueOnce(SESSION)
      .mockRejectedValue(notFoundError());
    listSessionTasks.mockResolvedValue([workingTask()]);

    const { result, queryClient } = renderWith();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: sessionQueryKey('gazelle', 'abc'),
      });
    });

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    expect(result.current.error).toBeUndefined();
  });

  it('reports no conversation when the tasks read fails on first load', async () => {
    // The session read succeeding does not mean the conversation is empty. Callers
    // need to tell "absent" from "empty" or they render a fabricated blank session.
    getSessionDetail.mockResolvedValue(SESSION);
    listSessionTasks.mockRejectedValue(new Error('kagent is unavailable'));

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasConversation).toBe(false);
    expect(result.current.detail).toBeDefined();
    expect(result.current.taskCount).toBe(0);
    expect(result.current.error?.message).toBe('kagent is unavailable');
  });

  it('reports a conversation that is genuinely empty', async () => {
    // The other side of it: a session created but never run reads as `[]`, which is
    // data, and must render as "no activity" rather than as a failure.
    getSessionDetail.mockResolvedValue(SESSION);
    listSessionTasks.mockResolvedValue([]);

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasConversation).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('keeps a loaded session when a poll returns an unreadable 200', async () => {
    // `getSessionDetail` resolves undefined for any 200 that does not parse — an
    // expired oauth2-proxy serving an HTML sign-in page is the realistic trigger.
    // Nothing was deleted, so the user must not be told the session is gone.
    getSessionDetail
      .mockResolvedValueOnce(SESSION)
      .mockResolvedValue(undefined);
    listSessionTasks.mockResolvedValue([workingTask()]);

    const { result, queryClient } = renderWith();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: sessionQueryKey('gazelle', 'abc'),
      });
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.isNotFound).toBe(false);
    expect(result.current.detail).toBeDefined();
  });

  it('still reports not found for an empty read before anything loaded', async () => {
    // The gate above must not swallow the real case: a 200 with no session, on a
    // page that never had one, is exactly how kagent says "no such session".
    getSessionDetail.mockResolvedValue(undefined);
    listSessionTasks.mockResolvedValue([]);

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    expect(result.current.error).toBeUndefined();
  });

  it('stops both reads while a delete is in flight', async () => {
    getSessionDetail.mockResolvedValue(SESSION);
    listSessionTasks.mockResolvedValue([workingTask()]);

    const { result } = renderHookWith({ enabled: false });

    // Nothing is requested at all, so no scheduled tick can land mid-delete and
    // 404 under the caller's navigation.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getSessionDetail).not.toHaveBeenCalled();
    expect(listSessionTasks).not.toHaveBeenCalled();
  });

  // The only timer-dependent test here: the cadence rules themselves are covered
  // purely in `lib/kagentSessionPolling.test.ts`, but a pure test cannot prove the
  // interval is actually passed to `useQuery`. If this ever turns flaky it can go
  // without losing coverage of the logic.
  it('refetches the conversation on its own while a task is working', async () => {
    getSessionDetail.mockResolvedValue(SESSION);
    listSessionTasks.mockResolvedValue([workingTask()]);

    // Fake timers from before the render: the interval is scheduled at mount, so
    // switching afterwards would leave a real timer nothing can advance.
    jest.useFakeTimers();
    try {
      const { result } = renderWith();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(listSessionTasks).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(ACTIVE_REFETCH_INTERVAL_MS);
      });

      await waitFor(() => expect(listSessionTasks).toHaveBeenCalledTimes(2));
    } finally {
      jest.useRealTimers();
    }
  });
});
