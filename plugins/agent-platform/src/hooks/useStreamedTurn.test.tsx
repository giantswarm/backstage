import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { sessionTasksQueryKey } from './useSessionDetail';
import { type OpenTurnStream, useStreamedTurn } from './useStreamedTurn';

const listSessionTasks = jest.fn();
const subscribeToTask = jest.fn();
const kagentApi = { listSessionTasks, subscribeToTask } as unknown as KagentApi;

function renderTurn(agent?: { namespace: string; name: string }) {
  const queryClient = new QueryClient();
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useStreamedTurn('gazelle', 'abc', agent), {
      wrapper,
    }),
    invalidateQueries,
  };
}

/** An error named like the transport failures `streamMessage` throws. */
function transportError(message: string): Error {
  const error = new Error(message);
  error.name = 'StreamTransportError';
  return error;
}

/**
 * A stream that stays open until its signal aborts it, the way the browser
 * ends a fetch and its body read; `emit` hands it events meanwhile.
 */
function hangingStream() {
  const handle: {
    signal?: AbortSignal;
    emit: (event: unknown) => void;
  } = { emit: () => {} };
  const open: OpenTurnStream = (onEvent, signal) =>
    new Promise<void>((_, reject) => {
      handle.signal = signal;
      handle.emit = onEvent;
      signal.addEventListener('abort', () => reject(transportError('aborted')));
    });
  return { handle, open };
}

beforeEach(() => {
  listSessionTasks.mockReset();
  listSessionTasks.mockResolvedValue([]);
  subscribeToTask.mockReset();
});

describe('useStreamedTurn', () => {
  it('ends a resubscription in flight when its page unmounts, and tries no more', async () => {
    let subscription: AbortSignal | undefined;
    subscribeToTask.mockImplementation(
      (_i, _s, _a, _t, _onEvent, signal: AbortSignal) =>
        new Promise((_, reject) => {
          subscription = signal;
          signal.addEventListener('abort', () =>
            reject(transportError('aborted')),
          );
        }),
    );
    const { result, unmount } = renderTurn({
      namespace: 'kagent',
      name: 'issue-tracker',
    });

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.run('message-1', async onEvent => {
        onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
      });
    });
    await waitFor(() => expect(subscription).toBeDefined());
    expect(result.current.isReconnecting).toBe(true);

    unmount();

    expect(subscription?.aborted).toBe(true);
    await expect(outcome).resolves.toMatchObject({ dispatched: true });
    expect(subscribeToTask).toHaveBeenCalledTimes(1);
  });

  it('aborts the stream in flight when its page unmounts, and reports nothing', async () => {
    const { handle, open } = hangingStream();
    const { result, unmount, invalidateQueries } = renderTurn();

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.run('message-1', open);
    });
    await waitFor(() => expect(handle.signal).toBeDefined());
    act(() =>
      handle.emit({ kind: 'task', id: 'task-1', status: { state: 'working' } }),
    );
    expect(handle.signal?.aborted).toBe(false);

    unmount();

    expect(handle.signal?.aborted).toBe(true);
    await expect(outcome).resolves.toMatchObject({ dispatched: true });
    // Nothing on screen to refresh, so nothing is fetched now; the reads are
    // only marked stale, for the next visit.
    expect(listSessionTasks).not.toHaveBeenCalled();
    expect(invalidateQueries.mock.calls.map(([filters]) => filters)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ refetchType: 'none' }),
      ]),
    );
    invalidateQueries.mock.calls.forEach(([filters]) =>
      expect(filters).toMatchObject({ refetchType: 'none' }),
    );
  });

  it('has a visit back within a minute read the conversation afresh, not the read from before the turn', async () => {
    // The app's client trusts a read for a minute.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    // A new session's page read its conversation before the first turn.
    queryClient.setQueryData(sessionTasksQueryKey('gazelle', 'abc'), []);
    const { handle, open } = hangingStream();
    const page = renderHook(() => useStreamedTurn('gazelle', 'abc'), {
      wrapper,
    });
    act(() => {
      void page.result.current.run('message-1', open);
    });
    await waitFor(() => expect(handle.signal).toBeDefined());
    act(() =>
      handle.emit({ kind: 'task', id: 'task-1', status: { state: 'working' } }),
    );

    // The person opens another session, then comes back through the toast.
    page.unmount();
    const turnTask = { id: 'task-1', status: { state: 'input-required' } };
    listSessionTasks.mockResolvedValue([turnTask]);
    const back = renderHook(
      () =>
        useQuery({
          queryKey: sessionTasksQueryKey('gazelle', 'abc'),
          queryFn: () => kagentApi.listSessionTasks('gazelle', 'abc'),
        }),
      { wrapper },
    );

    await waitFor(() => expect(back.result.current.data).toEqual([turnTask]));
    expect(listSessionTasks).toHaveBeenCalledTimes(1);
  });

  it('reads the conversation afresh after the turn even while the first read is still in flight', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    // A new session's page asks for its conversation as the first message
    // goes; that read is answered from before the turn, and only after a turn
    // that ended at once.
    let answerFirstRead: (tasks: unknown[]) => void = () => {};
    listSessionTasks.mockImplementationOnce(
      () => new Promise(resolve => (answerFirstRead = resolve)),
    );
    const turnTask = { id: 'task-1', status: { state: 'failed' } };
    listSessionTasks.mockResolvedValue([turnTask]);
    const page = renderHook(
      () => ({
        turn: useStreamedTurn('gazelle', 'abc'),
        tasks: useQuery({
          queryKey: sessionTasksQueryKey('gazelle', 'abc'),
          queryFn: () => kagentApi.listSessionTasks('gazelle', 'abc'),
        }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(listSessionTasks).toHaveBeenCalledTimes(1));

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = page.result.current.turn.run('message-1', async onEvent => {
        onEvent({ kind: 'task', id: 'task-1', status: { state: 'failed' } });
      });
    });
    await act(async () => {
      answerFirstRead([]);
      await outcome;
    });

    await waitFor(() =>
      expect(page.result.current.tasks.data).toEqual([turnTask]),
    );
    expect(listSessionTasks).toHaveBeenCalledTimes(2);
  });

  it('keeps a stream left before its first event open until that event, so the message is dispatched (R2-3)', async () => {
    const { handle, open } = hangingStream();
    const { result, unmount, invalidateQueries } = renderTurn();

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.run('message-1', open);
    });
    await waitFor(() => expect(handle.signal).toBeDefined());

    unmount();

    // Aborted now, the relay would abort its upstream request too, and the
    // message might never reach kagent.
    expect(handle.signal?.aborted).toBe(false);

    handle.emit({ kind: 'task', id: 'task-1', status: { state: 'working' } });

    expect(handle.signal?.aborted).toBe(true);
    await expect(outcome).resolves.toMatchObject({ dispatched: true });
    expect(listSessionTasks).not.toHaveBeenCalled();
    invalidateQueries.mock.calls.forEach(([filters]) =>
      expect(filters).toMatchObject({ refetchType: 'none' }),
    );
  });

  it('still reports a failure before any event after the page went away', async () => {
    let fail: (error: Error) => void = () => {};
    const { result, unmount } = renderTurn();

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.run(
        'message-1',
        () =>
          new Promise<void>((_, reject) => {
            fail = reject;
          }),
      );
    });
    unmount();
    fail(new Error('rejected by the relay'));

    await expect(outcome).rejects.toThrow('rejected by the relay');
  });

  it('still reports a transport failure before any event while mounted', async () => {
    const { result } = renderTurn();

    await expect(
      act(() =>
        result.current.run('message-1', async () => {
          throw transportError('connection reset');
        }),
      ),
    ).rejects.toThrow('connection reset');
    expect(listSessionTasks).toHaveBeenCalledTimes(1);
  });
});
