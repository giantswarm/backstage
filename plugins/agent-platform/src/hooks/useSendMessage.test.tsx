import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import {
  InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useSendMessage } from './useSendMessage';
import { StreamTurn } from '../lib/kagentStreamTurn';

const streamMessage = jest.fn();
const listSessionTasks = jest.fn();
const subscribeToTask = jest.fn();

const kagentApi = {
  streamMessage,
  listSessionTasks,
  subscribeToTask,
} as unknown as KagentApi;
const analyticsApi = mockApis.analytics.mock();

const AGENT = { namespace: 'kagent', name: 'issue-tracker' };

function renderWith() {
  return renderWithAgent(AGENT);
}

function renderWithoutAgent() {
  return renderWithAgent(undefined);
}

function renderWithAgent(
  agent: { namespace: string; name: string } | undefined,
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kagentApiRef, kagentApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  return {
    ...renderHook(() => useSendMessage('gazelle', 'abc', agent), { wrapper }),
    invalidateQueries,
    queryClient,
  };
}

const TASKS_KEY = [
  'agent-platform',
  'kagent',
  'session-tasks',
  'gazelle',
  'abc',
];

/** The task a sent message opened, as the conversation poll would list it. */
function taskHolding(messageId: string, state: string) {
  return {
    id: 'task-1',
    contextId: 'abc',
    kind: 'task',
    status: { state, timestamp: new Date().toISOString() },
    history: [
      {
        kind: 'message',
        role: 'user',
        messageId,
        parts: [{ kind: 'text', text: 'hello' }],
      },
    ],
  };
}

/** The id the hook generated for the one message sent so far. */
function sentMessageId(): string {
  return streamMessage.mock.calls[0][3].messageId;
}

/** The filters a given call to `invalidateQueries` was made with. */
function invalidationFor(
  invalidateQueries: jest.SpyInstance,
  queryKey: unknown[],
): InvalidateQueryFilters | undefined {
  const call = invalidateQueries.mock.calls.find(
    ([filters]) =>
      JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey),
  );
  return call?.[0];
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
  streamMessage.mockReset();
  streamMessage.mockResolvedValue(undefined);
  listSessionTasks.mockReset();
  listSessionTasks.mockResolvedValue([]);
  // A decision by default — the turn cannot be followed again — so a test
  // about what follows a lost stream need not wait out the retries.
  subscribeToTask.mockReset();
  subscribeToTask.mockRejectedValue(notFound('That turn does not exist.'));
});

/** A decision, named as the client names a 404. */
function notFound(message: string): Error {
  const error = new Error(message);
  error.name = 'NotFoundError';
  return error;
}

/** An error carrying the name `streamMessage` uses for transport failures. */
function transportError(message: string): Error {
  const error = new Error(message);
  error.name = 'StreamTransportError';
  return error;
}

/**
 * The transport failure the backend's 500 `UpstreamError` with
 * `reason: "timeout"` becomes: its wait for kagent's first event ran out.
 */
function firstEventTimeout(): Error {
  return Object.assign(
    transportError('The streaming send failed with status 500.'),
    { status: 500, reason: 'timeout' },
  );
}

const SESSION_KEY = ['agent-platform', 'kagent', 'session', 'gazelle', 'abc'];

/** A settled turn, as the conversation poll lists it. */
function settledTask(id: string) {
  return { id, contextId: 'abc', kind: 'task', status: { state: 'completed' } };
}

/** A terminal status-update carrying one complete reply. */
function finalReplyEvent(text: string, messageId = 'reply-1') {
  return {
    kind: 'status-update',
    final: true,
    status: {
      state: 'completed',
      message: {
        kind: 'message',
        messageId,
        role: 'agent',
        parts: [{ kind: 'text', text }],
      },
    },
  };
}

describe('useSendMessage', () => {
  it('sends the message to the session and its agent', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.sendMessage('why is the ingress failing?');
    });

    expect(streamMessage).toHaveBeenCalledWith(
      'gazelle',
      'abc',
      AGENT,
      expect.objectContaining({ text: 'why is the ingress failing?' }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    // Reported without the text.
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.messageSent',
        attributes: {},
      }),
    );
  });

  it('sends the images as the API takes them, and keeps them on the pending message', async () => {
    const { result } = renderWith();
    const image = {
      id: 'image-1',
      name: 'a.png',
      mediaType: 'image/png' as const,
      byteSize: 6,
      previewUrl: 'data:image/png;base64,iVBORw0K',
    };
    streamMessage.mockImplementation(() => new Promise(() => {}));

    act(() => {
      result.current.sendMessage('look', [image]).catch(() => {});
    });

    await waitFor(() => expect(streamMessage).toHaveBeenCalled());
    expect(streamMessage.mock.calls[0][3]).toEqual({
      messageId: expect.any(String),
      text: 'look',
      images: [{ mediaType: 'image/png', data: 'iVBORw0K', name: 'a.png' }],
    });
    expect(result.current.pending?.images).toEqual([image]);
  });

  it('generates a message id, so the sent message can be recognised later', async () => {
    // The id has to exist before the request is made: it is what lets the
    // optimistically rendered message be matched to kagent's stored copy and
    // dropped, rather than showing twice for the rest of the turn.
    const { result } = renderWith();

    await act(async () => {
      await result.current.sendMessage('first');
    });
    await act(async () => {
      await result.current.sendMessage('second');
    });

    const ids = streamMessage.mock.calls.map(
      ([, , , message]) => message.messageId,
    );
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toEqual(ids[1]);
  });

  it('exposes the message as pending while the turn runs', async () => {
    // A turn can last minutes, and this is what the conversation renders in the
    // meantime — so it must be readable for the whole time the mutation is in
    // flight, not only at the moment of submitting.
    let release: () => void = () => {};
    streamMessage.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );

    const { result } = renderWith();

    act(() => {
      void result.current.sendMessage('take your time');
    });

    await waitFor(() => expect(result.current.isSending).toBe(true));
    expect(result.current.pending).toEqual(
      expect.objectContaining({ text: 'take your time' }),
    );
    expect(result.current.pending?.messageId).toBeTruthy();

    await act(async () => {
      release();
    });

    // Cleared on success, by which point the invalidation has been awaited and
    // kagent's own copy of the message is readable.
    await waitFor(() => expect(result.current.pending).toBeNull());
  });

  it('refreshes the conversation once the turn is recorded', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    const filters = invalidationFor(invalidateQueries, [
      'agent-platform',
      'kagent',
      'session-tasks',
      'gazelle',
      'abc',
    ]);
    expect(filters).toBeDefined();
    // Refetched, not merely marked stale: the user stays on the page and the
    // pending stand-in is only dropped once the real message can be read.
    expect(filters?.refetchType).toBeUndefined();
  });

  it('re-reads the conversation once as soon as the stream carries a file', async () => {
    // The live preview renders no files, so waiting for the stream to end (or
    // the next poll) would leave an attachment missing for the whole turn. The
    // terminal event repeats the file, and that must not re-read it again.
    const { result, invalidateQueries } = renderWith();
    let tasksReadsDuringStream = 0;
    streamMessage.mockImplementation(async (...args: unknown[]) => {
      const onEvent = args[4] as (event: unknown) => void;
      const fileEvent = (final: boolean) => ({
        kind: 'status-update',
        final,
        status: {
          state: final ? 'completed' : 'working',
          message: {
            kind: 'message',
            messageId: 'reply-1',
            role: 'agent',
            parts: [
              { kind: 'file', file: { name: 'chart.png', bytes: 'AAAA' } },
            ],
          },
        },
      });
      onEvent(fileEvent(false));
      onEvent(fileEvent(true));
      tasksReadsDuringStream = invalidateQueries.mock.calls.filter(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) === JSON.stringify(TASKS_KEY),
      ).length;
    });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(tasksReadsDuringStream).toBe(1);
  });

  it('does not re-read the conversation mid-stream for text alone', async () => {
    const { result, invalidateQueries } = renderWith();
    let tasksReadsDuringStream = 0;
    streamMessage.mockImplementation(async (...args: unknown[]) => {
      (args[4] as (event: unknown) => void)(finalReplyEvent('done'));
      tasksReadsDuringStream = invalidateQueries.mock.calls.length;
    });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(tasksReadsDuringStream).toBe(0);
  });

  it('refreshes the session, whose last activity the turn moved', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(
      invalidationFor(invalidateQueries, [
        'agent-platform',
        'kagent',
        'session',
        'gazelle',
        'abc',
      ]),
    ).toBeDefined();
  });

  it('surfaces a failure and drops the pending message', async () => {
    // Nothing was recorded, so the stand-in has to go — otherwise the transcript
    // keeps showing a message that was never sent.
    streamMessage.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow(
        'kagent said no',
      );
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('kagent said no'),
    );
    expect(result.current.pending).toBeNull();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('hands the failed message back so its text is not lost', async () => {
    // The stand-in is dropped — nothing was recorded — but the composer cleared
    // itself on submit, so this is the only remaining copy of what was typed.
    streamMessage.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith();

    await act(async () => {
      await expect(
        result.current.sendMessage('an expensive prompt'),
      ).rejects.toThrow();
    });

    await waitFor(() =>
      expect(result.current.failed).toEqual(
        expect.objectContaining({ text: 'an expensive prompt' }),
      ),
    );
    expect(result.current.pending).toBeNull();
  });

  it('carries a fresh id per failed attempt, so the same text restores again', async () => {
    streamMessage.mockRejectedValue(new Error('nope'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('same')).rejects.toThrow();
    });
    const first = result.current.failed?.messageId;

    await act(async () => {
      await expect(result.current.sendMessage('same')).rejects.toThrow();
    });

    await waitFor(() =>
      expect(result.current.failed?.messageId).not.toBe(first),
    );
  });

  it('clears the failed message when a later send succeeds', async () => {
    streamMessage.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('first try')).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.failed).not.toBeNull());

    streamMessage.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.sendMessage('second try');
    });

    await waitFor(() => expect(result.current.failed).toBeNull());
  });

  it('does not invalidate anything when the send failed', async () => {
    streamMessage.mockRejectedValue(new Error('nope'));
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow();
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refuses to send when the session has no resolvable agent', async () => {
    // The composer is withheld in this case, so this is a guard rather than a
    // user-facing path — but it must not build a request out of `undefined`.
    const { result } = renderWithoutAgent();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow(
        /agent for this session is unknown/,
      );
    });

    expect(streamMessage).not.toHaveBeenCalled();
  });

  it('clears the error on reset', async () => {
    streamMessage.mockRejectedValue(new Error('nope'));
    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.sendMessage('hello')).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('keeps a stable object identity across rerenders', async () => {
    // The page passes this down into memoized elements, so a new object every
    // render would defeat them.
    const { result, rerender } = renderWith();

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });

  describe('the streamed turn', () => {
    it('exposes streamed events while the turn runs, and drops the preview once reconciled', async () => {
      let release: () => void = () => {};
      let emit: (event: unknown) => void = () => {};
      streamMessage.mockImplementation(
        (_i, _s, _a, _m, onEvent: (event: unknown) => void) =>
          new Promise<void>(resolve => {
            emit = onEvent;
            release = resolve;
          }),
      );

      const { result } = renderWith();

      act(() => {
        void result.current.sendMessage('stream this');
      });
      await waitFor(() => expect(result.current.isSending).toBe(true));

      act(() => emit(finalReplyEvent('The reply, streamed.')));

      await waitFor(() =>
        expect(result.current.stream?.items).toEqual([
          expect.objectContaining({
            kind: 'agent-message',
            text: 'The reply, streamed.',
          }),
        ]),
      );

      await act(async () => {
        release();
      });

      // By now the awaited invalidation has put the canonical history on
      // screen; keeping the preview would double the reply.
      await waitFor(() => expect(result.current.stream).toBeNull());
    });

    it('resolves a stream that died after events, like a 202', async () => {
      // Any event proves the turn exists — the gateway cutting the stream at
      // 60 s must not read as a failed message, and needs no verification read.
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1' });
          throw transportError('the stream died');
        },
      );

      const { result, invalidateQueries } = renderWith();

      await act(async () => {
        await result.current.sendMessage('long turn');
      });

      expect(result.current.error).toBeNull();
      expect(invalidateQueries).toHaveBeenCalled();
      expect(listSessionTasks).not.toHaveBeenCalled();
    });

    it('verifies a transport failure with no events, and resolves when the message landed', async () => {
      // Mirrors the backend's verify-not-report rule for message/send: the
      // connection died before kagent said anything, but the message may well
      // have been dispatched — the history is the honest answer.
      streamMessage.mockRejectedValue(transportError('connection reset'));
      listSessionTasks.mockImplementation(async () => [
        {
          history: [{ messageId: streamMessage.mock.calls[0][3].messageId }],
        },
      ]);

      const { result, invalidateQueries } = renderWith();

      await act(async () => {
        await result.current.sendMessage('did this land?');
      });

      expect(result.current.error).toBeNull();
      expect(invalidateQueries).toHaveBeenCalled();
    });

    it('keeps the failure when the verification finds nothing', async () => {
      streamMessage.mockRejectedValue(transportError('connection reset'));
      listSessionTasks.mockResolvedValue([{ history: [] }]);

      const { result } = renderWith();

      await act(async () => {
        await expect(result.current.sendMessage('lost')).rejects.toThrow(
          'connection reset',
        );
      });

      await waitFor(() =>
        expect(result.current.failed).toEqual(
          expect.objectContaining({ text: 'lost' }),
        ),
      );
    });

    it('reports a decision without a verification read', async () => {
      // A rejected message, an unknown agent, an in-band A2A error: kagent
      // decided, and "cannot tell" logic must not soften what it said.
      streamMessage.mockRejectedValue(new Error('no such agent'));

      const { result } = renderWith();

      await act(async () => {
        await expect(result.current.sendMessage('hello')).rejects.toThrow(
          'no such agent',
        );
      });

      expect(listSessionTasks).not.toHaveBeenCalled();
    });

    describe('sends that keep timing out before the first event', () => {
      /** Send once, failing or not, and let the state settle. */
      async function send(result: {
        current: { sendMessage: (text: string) => Promise<void> };
      }) {
        await act(async () => {
          await result.current.sendMessage('hello').catch(() => {});
        });
      }

      beforeEach(() => {
        // The history read that checks the message: a settled turn, and not
        // the message.
        listSessionTasks.mockResolvedValue([settledTask('turn-1')]);
      });

      it('counts them in a row against the history the check read', async () => {
        streamMessage.mockRejectedValue(firstEventTimeout());
        const { result } = renderWith();

        await send(result);
        expect(result.current.timeouts).toEqual({
          count: 1,
          newestTaskId: 'turn-1',
        });

        await send(result);
        expect(result.current.timeouts).toEqual({
          count: 2,
          newestTaskId: 'turn-1',
        });
      });

      it('puts that read in the cache and re-reads the session', async () => {
        // A `RUNTIME_LOST` kagent recorded since takes the reported path; the
        // conversation was just read, and is not read twice.
        streamMessage.mockRejectedValue(firstEventTimeout());
        const { result, invalidateQueries, queryClient } = renderWith();

        await send(result);

        expect(queryClient.getQueryData(TASKS_KEY)).toEqual([
          settledTask('turn-1'),
        ]);
        expect(invalidationFor(invalidateQueries, SESSION_KEY)).toBeDefined();
        expect(invalidationFor(invalidateQueries, TASKS_KEY)).toBeUndefined();
        expect(listSessionTasks).toHaveBeenCalledTimes(1);
      });

      it('does not count one whose check could not read the history', async () => {
        // "Cannot tell" is not "did not land": a slow kagent API fails both.
        streamMessage.mockRejectedValue(firstEventTimeout());
        listSessionTasks.mockRejectedValue(new Error('timed out'));
        const { result } = renderWith();

        await send(result);
        await send(result);

        expect(result.current.error).not.toBeNull();
        expect(result.current.timeouts).toBeUndefined();
      });

      it('reads as nothing while the retry is in flight', async () => {
        streamMessage.mockRejectedValueOnce(firstEventTimeout());
        let release: () => void = () => {};
        streamMessage.mockImplementationOnce(
          () =>
            new Promise<void>((_, reject) => {
              release = () => reject(firstEventTimeout());
            }),
        );
        const { result } = renderWith();
        await send(result);
        expect(result.current.timeouts?.count).toBe(1);

        act(() => {
          void result.current.sendMessage('again').catch(() => {});
        });
        await waitFor(() => expect(result.current.isSending).toBe(true));
        expect(result.current.timeouts).toBeUndefined();

        await act(async () => {
          release();
        });
        await waitFor(() => expect(result.current.timeouts?.count).toBe(2));
      });

      it('ends the run once a send lands', async () => {
        streamMessage.mockRejectedValueOnce(firstEventTimeout());
        const { result } = renderWith();

        await send(result);
        expect(result.current.timeouts?.count).toBe(1);

        await send(result);
        expect(result.current.timeouts).toBeUndefined();
      });

      it('ends the run on a send that failed otherwise', async () => {
        streamMessage
          .mockRejectedValueOnce(firstEventTimeout())
          .mockRejectedValueOnce(transportError('connection reset'));
        const { result } = renderWith();

        await send(result);
        await send(result);

        expect(result.current.timeouts).toBeUndefined();
      });

      it('ends the run on a timed-out send whose message landed', async () => {
        // The backend gave up waiting, but the history holds the message: the
        // runtime is up, only slow.
        streamMessage.mockRejectedValue(firstEventTimeout());
        const { result } = renderWith();
        await send(result);
        expect(result.current.timeouts?.count).toBe(1);

        listSessionTasks.mockImplementation(async () => [
          taskHolding(streamMessage.mock.calls[1][3].messageId, 'working'),
        ]);
        await send(result);

        expect(result.current.error).toBeNull();
        expect(result.current.timeouts).toBeUndefined();
      });
    });

    it('does not report a stream that delivered the end of the turn as lost', async () => {
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent(finalReplyEvent('All of the reply.'));
        },
      );
      const { result } = renderWith();

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(result.current.isStreamLost).toBe(false);
    });

    it('reports the stream lost when it ends before the turn does', async () => {
      // The gateway closed the response mid-reply: the stream is over, the
      // turn is not. Not an error — the poll follows the turn — but not
      // "working" as if nothing happened either.
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
        },
      );
      const { result } = renderWith();

      await act(async () => {
        await result.current.sendMessage('long turn');
      });

      expect(result.current.isStreamLost).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('reports a stream that died after events as lost', async () => {
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
          throw transportError('the stream died');
        },
      );
      const { result } = renderWith();

      await act(async () => {
        await result.current.sendMessage('long turn');
      });

      expect(result.current.isStreamLost).toBe(true);
    });

    it('keeps the loss while the poll still shows the turn working', async () => {
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
        },
      );
      const { result, queryClient } = renderWith();
      await act(async () => {
        await result.current.sendMessage('long turn');
      });

      act(() => {
        queryClient.setQueryData(TASKS_KEY, [
          taskHolding(sentMessageId(), 'working'),
        ]);
      });

      expect(result.current.isStreamLost).toBe(true);
    });

    it('forgets the loss once the poll shows the turn over', async () => {
      // The finished reply arrived through the poll: the page shows it as
      // completed, and nothing is lost any more.
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
        },
      );
      const { result, queryClient } = renderWith();
      await act(async () => {
        await result.current.sendMessage('long turn');
      });
      expect(result.current.isStreamLost).toBe(true);

      act(() => {
        queryClient.setQueryData(TASKS_KEY, [
          taskHolding(sentMessageId(), 'completed'),
        ]);
      });

      await waitFor(() => expect(result.current.isStreamLost).toBe(false));
    });

    it('forgets the loss once the poll shows the turn waiting on a human', async () => {
      // `input-required` is active, but the answer panel is the display for
      // it — not a notice about a stream that has nothing left to preview.
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
        },
      );
      const { result, queryClient } = renderWith();
      await act(async () => {
        await result.current.sendMessage('long turn');
      });

      act(() => {
        queryClient.setQueryData(TASKS_KEY, [
          taskHolding(sentMessageId(), 'input-required'),
        ]);
      });

      await waitFor(() => expect(result.current.isStreamLost).toBe(false));
    });

    it('starts the next send with nothing lost', async () => {
      streamMessage.mockImplementationOnce(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
        },
      );
      const { result } = renderWith();
      await act(async () => {
        await result.current.sendMessage('first');
      });
      expect(result.current.isStreamLost).toBe(true);

      streamMessage.mockImplementationOnce(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent(finalReplyEvent('done', 'reply-2'));
        },
      );
      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(result.current.isStreamLost).toBe(false);
    });

    it('aborts a stream still open once the poll shows its turn over', async () => {
      // A stream that hangs after the turn finished would otherwise keep the
      // send pending — and the page on "Working…" — for as long as the tab lives.
      let signal: AbortSignal | undefined;
      let emit: (event: unknown) => void = () => {};
      streamMessage.mockImplementation(
        (
          _i,
          _s,
          _a,
          _m,
          onEvent: (event: unknown) => void,
          streamSignal: AbortSignal,
        ) =>
          new Promise<void>((_, reject) => {
            signal = streamSignal;
            emit = onEvent;
            streamSignal.addEventListener('abort', () =>
              reject(transportError('aborted')),
            );
          }),
      );
      const { result, queryClient } = renderWith();

      act(() => {
        void result.current.sendMessage('hangs');
      });
      await waitFor(() => expect(signal).toBeDefined());
      act(() =>
        emit({ kind: 'task', id: 'task-1', status: { state: 'working' } }),
      );

      act(() => {
        queryClient.setQueryData(TASKS_KEY, [
          taskHolding(sentMessageId(), 'completed'),
        ]);
      });

      await waitFor(() => expect(signal?.aborted).toBe(true));
      // Resolved like any stream cut after events: no error, the poll's record
      // is the answer — and it already has the answer, so nothing is lost.
      await waitFor(() => expect(result.current.isSending).toBe(false));
      expect(result.current.error).toBeNull();
      expect(result.current.isStreamLost).toBe(false);
    });

    it('leaves a stream alone while the poll shows its turn working', async () => {
      let signal: AbortSignal | undefined;
      let emit: (event: unknown) => void = () => {};
      let release: () => void = () => {};
      streamMessage.mockImplementation(
        (
          _i,
          _s,
          _a,
          _m,
          onEvent: (event: unknown) => void,
          streamSignal: AbortSignal,
        ) =>
          new Promise<void>(resolve => {
            signal = streamSignal;
            emit = onEvent;
            release = resolve;
          }),
      );
      const { result, queryClient } = renderWith();

      act(() => {
        void result.current.sendMessage('long turn');
      });
      await waitFor(() => expect(signal).toBeDefined());
      act(() =>
        emit({ kind: 'task', id: 'task-1', status: { state: 'working' } }),
      );

      act(() => {
        queryClient.setQueryData(TASKS_KEY, [
          taskHolding(sentMessageId(), 'working'),
        ]);
      });

      expect(signal?.aborted).toBe(false);
      expect(result.current.isSending).toBe(true);

      await act(async () => {
        release();
      });
    });

    describe('a stream cut mid-turn', () => {
      // A kagent controller rollout ends every stream in flight — the gateway
      // relays `closed pool` and closes — while the turn itself runs on.
      const working = {
        kind: 'task',
        id: 'task-1',
        status: { state: 'working' },
      };
      const said = (text: string, messageId: string, final = false) => ({
        kind: 'status-update',
        taskId: 'task-1',
        final,
        status: {
          state: final ? 'completed' : 'working',
          message: {
            kind: 'message',
            messageId,
            role: 'agent',
            parts: [{ kind: 'text', text }],
          },
        },
      });
      const cutByRollout = async (
        _i: string,
        _s: string,
        _a: unknown,
        _m: unknown,
        onEvent: (event: unknown) => void,
      ) => {
        onEvent(working);
        onEvent(said('Checking the nodes.', 'm-1'));
        return { error: 'Failed to get Session: closed pool' };
      };
      /** The texts the preview shows, completed items then the open run. */
      const previewTexts = (stream: StreamTurn | null) => [
        ...(stream?.items ?? []).map(item =>
          'text' in item ? item.text : item.kind,
        ),
        ...(stream?.live ? [stream.live.text] : []),
      ];

      it('resubscribes to the turn and continues the live view where it stopped, repeating nothing', async () => {
        streamMessage.mockImplementation(cutByRollout);
        let reopen: () => void = () => {};
        let finish: () => void = () => {};
        subscribeToTask.mockImplementation(
          async (_i, _s, _a, _t, onEvent: (event: unknown) => void) => {
            await new Promise<void>(resolve => (reopen = resolve));
            // The snapshot repeats the task's history; it is not shown again.
            onEvent({
              ...working,
              history: [said('Checking the nodes.', 'm-1').status.message],
            });
            onEvent(said('Seven nodes are ready.', 'm-2'));
            await new Promise<void>(resolve => (finish = resolve));
            onEvent(said('Seven nodes are ready.', 'm-2', true));
            return {};
          },
        );
        const { result } = renderWith();

        let sending: Promise<void> = Promise.resolve();
        act(() => {
          sending = result.current.sendMessage('how are the nodes?');
        });

        // Between the cut and the resubscription: reconnecting, the preview
        // kept, and nothing said about a lost stream.
        await waitFor(() => expect(result.current.isReconnecting).toBe(true));
        expect(previewTexts(result.current.stream)).toEqual([
          'Checking the nodes.',
        ]);
        expect(result.current.isStreamLost).toBe(false);
        expect(subscribeToTask).toHaveBeenCalledWith(
          'gazelle',
          'abc',
          AGENT,
          'task-1',
          expect.any(Function),
          expect.any(AbortSignal),
        );

        act(() => reopen());

        await waitFor(() =>
          expect(previewTexts(result.current.stream)).toEqual([
            'Checking the nodes.',
            'Seven nodes are ready.',
          ]),
        );
        expect(result.current.isReconnecting).toBe(false);
        expect(result.current.isSending).toBe(true);

        await act(async () => {
          finish();
          await sending;
        });

        expect(result.current.isStreamLost).toBe(false);
        expect(result.current.isReconnecting).toBe(false);
        expect(result.current.error).toBeNull();
        expect(subscribeToTask).toHaveBeenCalledTimes(1);
      });

      it('falls back to the poll when resubscribing keeps failing, and shows the result once the turn completes', async () => {
        jest.useFakeTimers();
        try {
          streamMessage.mockImplementation(cutByRollout);
          // The controller is not back within the backoff.
          subscribeToTask.mockRejectedValue(
            transportError('The streaming send failed with status 503.'),
          );
          const { result, queryClient } = renderWith();

          let sending: Promise<void> = Promise.resolve();
          act(() => {
            sending = result.current.sendMessage('how are the nodes?');
          });
          await waitFor(() => expect(result.current.isReconnecting).toBe(true));

          await act(async () => {
            await jest.advanceTimersByTimeAsync(10_000);
            await sending;
          });

          // Bounded: one try at once and three more, backing off.
          expect(subscribeToTask).toHaveBeenCalledTimes(4);
          expect(result.current.isReconnecting).toBe(false);
          expect(result.current.isStreamLost).toBe(true);
          expect(result.current.error).toBeNull();

          // The turn completes; the poll brings its result, and nothing is
          // lost any more.
          act(() => {
            queryClient.setQueryData(TASKS_KEY, [
              taskHolding(sentMessageId(), 'completed'),
            ]);
          });
          await waitFor(() => expect(result.current.isStreamLost).toBe(false));
        } finally {
          jest.useRealTimers();
        }
      });

      /** Resolve after `ms` of (fake) time. */
      const after = (ms: number) =>
        new Promise<void>(resolve => setTimeout(resolve, ms));
      /** Run `body` with fake timers and clock, restoring real ones after. */
      const withFakeTime = async (body: () => Promise<void>) => {
        jest.useFakeTimers();
        try {
          await body();
        } finally {
          jest.useRealTimers();
        }
      };

      it('keeps following a quiet turn whose route cuts every stream at 60 s', async () => {
        await withFakeTime(async () => {
          streamMessage.mockImplementation(cutByRollout);
          // Each subscription opens (the snapshot) and says nothing more
          // before the route cuts it.
          subscribeToTask.mockImplementation(
            async (_i, _s, _a, _t, onEvent: (event: unknown) => void) => {
              onEvent(working);
              await after(60_000);
              return {};
            },
          );
          const { result } = renderWith();

          let sending: Promise<void> = Promise.resolve();
          act(() => {
            sending = result.current.sendMessage('how are the nodes?');
          });
          await act(async () => {
            await jest.advanceTimersByTimeAsync(6 * 61_000);
          });

          expect(subscribeToTask.mock.calls.length).toBeGreaterThanOrEqual(6);
          expect(result.current.isStreamLost).toBe(false);

          subscribeToTask.mockImplementation(
            async (_i, _s, _a, _t, onEvent: (event: unknown) => void) => {
              onEvent(said('Seven nodes are ready.', 'm-2', true));
              return {};
            },
          );
          await act(async () => {
            await jest.advanceTimersByTimeAsync(61_000);
            await sending;
          });
          expect(result.current.isStreamLost).toBe(false);
          expect(result.current.error).toBeNull();
        });
      });

      it('backs a stream that keeps dropping right after it opens off, never resubscribing back to back', async () => {
        await withFakeTime(async () => {
          streamMessage.mockImplementation(cutByRollout);
          const at: number[] = [];
          subscribeToTask.mockImplementation(
            async (_i, _s, _a, _t, onEvent: (event: unknown) => void) => {
              at.push(Date.now());
              onEvent(working);
              onEvent(said('Still checking.', `m-${at.length + 1}`));
              return { error: 'upstream connect error' };
            },
          );
          const { result } = renderWith();

          act(() => {
            void result.current.sendMessage('how are the nodes?');
          });
          await act(async () => {
            await jest.advanceTimersByTimeAsync(12_000);
          });

          const gaps = at.slice(1).map((time, i) => time - at[i]);
          expect(gaps.slice(0, 4)).toEqual([1000, 2000, 4000, 4000]);
          expect(at.length).toBeLessThan(6);
        });
      });

      it('stops resubscribing once the turn has been followed for the streams’ bound', async () => {
        await withFakeTime(async () => {
          streamMessage.mockImplementation(cutByRollout);
          // Steady subscriptions, each cut after 10 minutes.
          subscribeToTask.mockImplementation(
            async (_i, _s, _a, _t, onEvent: (event: unknown) => void) => {
              onEvent(working);
              onEvent(said('Still working.', 'm-2'));
              await after(10 * 60_000);
              return {};
            },
          );
          const { result } = renderWith();

          let sending: Promise<void> = Promise.resolve();
          act(() => {
            sending = result.current.sendMessage('how are the nodes?');
          });
          await act(async () => {
            await jest.advanceTimersByTimeAsync(40 * 60_000);
            await sending;
          });

          expect(subscribeToTask).toHaveBeenCalledTimes(3);
          expect(result.current.isStreamLost).toBe(true);
        });
      });

      it('leaves a subscription refused in a lost runtime’s words to the runtime-loss notice', async () => {
        streamMessage.mockImplementation(cutByRollout);
        const refusal = new Error(
          'The agent on gazelle did not accept the subscription to the running turn: failed to connect to Session runtime',
        );
        refusal.name = 'UpstreamError';
        subscribeToTask.mockRejectedValue(refusal);
        const { result } = renderWith();

        await act(async () => {
          await result.current.sendMessage('how are the nodes?');
        });

        expect(subscribeToTask).toHaveBeenCalledTimes(1);
        expect(result.current.isStreamLost).toBe(false);
      });

      it('follows a turn whose stream was cut before its first event, once the history shows where it went', async () => {
        streamMessage.mockRejectedValue(
          transportError('The connection failed while sending the message.'),
        );
        listSessionTasks.mockImplementation(async () => [
          taskHolding(sentMessageId(), 'working'),
        ]);
        subscribeToTask.mockImplementation(
          async (_i, _s, _a, _t, onEvent: (event: unknown) => void) => {
            onEvent(said('Seven nodes are ready.', 'm-2', true));
            return {};
          },
        );
        const { result } = renderWith();

        await act(async () => {
          await result.current.sendMessage('how are the nodes?');
        });

        expect(subscribeToTask).toHaveBeenCalledWith(
          'gazelle',
          'abc',
          AGENT,
          'task-1',
          expect.any(Function),
          expect.any(AbortSignal),
        );
        expect(result.current.isStreamLost).toBe(false);
        expect(result.current.error).toBeNull();
      });

      it('stops at a decision without retrying, and follows the poll', async () => {
        streamMessage.mockImplementation(cutByRollout);
        const { result } = renderWith();

        await act(async () => {
          await result.current.sendMessage('how are the nodes?');
        });

        expect(subscribeToTask).toHaveBeenCalledTimes(1);
        expect(result.current.isStreamLost).toBe(true);
      });

      it('does not resubscribe a turn that paused for the person', async () => {
        // A v1 pause ends the stream with no final flag; the answer panel is
        // what moves the turn on, not a subscription.
        streamMessage.mockImplementation(
          async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
            onEvent(working);
            onEvent({
              kind: 'status-update',
              taskId: 'task-1',
              status: { state: 'input-required' },
            });
          },
        );
        const { result } = renderWith();

        await act(async () => {
          await result.current.sendMessage('how are the nodes?');
        });

        expect(subscribeToTask).not.toHaveBeenCalled();
      });

      it('does not resubscribe a stream that ended with a lost runtime, nor call it a lost stream', async () => {
        // The turn failed with the runtime: the re-read shows the runtime
        // loss, which the page tells apart from a stream that went away.
        streamMessage.mockImplementation(
          async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
            onEvent(working);
            return {
              error: 'runtime lost: local snapshot on node ip-10-0-1-2 is gone',
            };
          },
        );
        const { result } = renderWith();

        await act(async () => {
          await result.current.sendMessage('how are the nodes?');
        });

        expect(subscribeToTask).not.toHaveBeenCalled();
        expect(result.current.isStreamLost).toBe(false);
      });
    });

    it('drops the preview when the send fails', async () => {
      streamMessage.mockImplementation(
        async (_i, _s, _a, _m, onEvent: (event: unknown) => void) => {
          onEvent(finalReplyEvent('half a reply'));
          throw new Error('rejected mid-way');
        },
      );
      // Dispatched, so the failure is swallowed and reconciliation runs — but a
      // preview left behind after the mutation settles would be stale.
      const { result } = renderWith();

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      await waitFor(() => expect(result.current.stream).toBeNull());
    });
  });
});
