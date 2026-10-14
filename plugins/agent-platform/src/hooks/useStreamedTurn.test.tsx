import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { type OpenTurnStream, useStreamedTurn } from './useStreamedTurn';

const listSessionTasks = jest.fn();
const kagentApi = { listSessionTasks } as unknown as KagentApi;

function renderTurn() {
  const queryClient = new QueryClient();
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useStreamedTurn('gazelle', 'abc'), { wrapper }),
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
});

describe('useStreamedTurn', () => {
  it('aborts the stream in flight when its page unmounts, and reports nothing', async () => {
    const { handle, open } = hangingStream();
    const { result, unmount, invalidateQueries } = renderTurn();

    let outcome: Promise<void> = Promise.resolve();
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
    await expect(outcome).resolves.toBeUndefined();
    // Nothing on screen to refresh: the next visit reads the conversation.
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('keeps a stream left before its first event open until that event, so the message is dispatched (R2-3)', async () => {
    const { handle, open } = hangingStream();
    const { result, unmount, invalidateQueries } = renderTurn();

    let outcome: Promise<void> = Promise.resolve();
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
    await expect(outcome).resolves.toBeUndefined();
    expect(listSessionTasks).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('still reports a failure before any event after the page went away', async () => {
    let fail: (error: Error) => void = () => {};
    const { result, unmount } = renderTurn();

    let outcome: Promise<void> = Promise.resolve();
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
