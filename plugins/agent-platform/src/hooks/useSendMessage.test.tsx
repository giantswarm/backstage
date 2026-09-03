import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useSendMessage } from './useSendMessage';

const streamMessage = jest.fn();
const listSessionTasks = jest.fn();

const kagentApi = { streamMessage, listSessionTasks } as unknown as KagentApi;

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
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  return {
    ...renderHook(() => useSendMessage('gazelle', 'abc', agent), { wrapper }),
    invalidateQueries,
  };
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
  streamMessage.mockReset();
  streamMessage.mockResolvedValue(undefined);
  listSessionTasks.mockReset();
  listSessionTasks.mockResolvedValue([]);
});

/** An error carrying the name `streamMessage` uses for transport failures. */
function transportError(message: string): Error {
  const error = new Error(message);
  error.name = 'StreamTransportError';
  return error;
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
    );
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
