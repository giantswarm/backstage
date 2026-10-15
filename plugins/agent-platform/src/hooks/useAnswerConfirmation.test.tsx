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
import {
  ANSWER_TAKEN_POLL_MS,
  ANSWER_TAKEN_WAIT_MS,
  isAnswerNotTakenError,
  useAnswerConfirmation,
} from './useAnswerConfirmation';

const streamAnswer = jest.fn();
const listSessionTasks = jest.fn();

const kagentApi = { streamAnswer, listSessionTasks } as unknown as KagentApi;

const SESSION_KEY = ['agent-platform', 'kagent', 'session', 'gazelle', 'abc'];
const TASKS_KEY = [
  'agent-platform',
  'kagent',
  'session-tasks',
  'gazelle',
  'abc',
];

const agent = { namespace: 'kagent', name: 'grill-master' };

// Two entry points rather than one taking `undefined`: passing `undefined` to a
// parameter with a default silently gets the default, so a "no agent" test would
// have exercised the opposite of what it claims. Bitten once already in this plugin.
function renderWithoutAgent() {
  return renderWith(undefined);
}

function renderWith(withAgent: typeof agent | undefined) {
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
    ...renderHook(() => useAnswerConfirmation('gazelle', 'abc', withAgent), {
      wrapper,
    }),
    invalidateQueries,
  };
}

function invalidationFor(
  invalidateQueries: jest.SpyInstance,
  queryKey: unknown[],
): InvalidateQueryFilters | undefined {
  return invalidateQueries.mock.calls.find(
    ([filters]) =>
      JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey),
  )?.[0];
}

/** An error carrying the name the client uses for transport failures. */
function transportError(message: string): Error {
  const error = new Error(message);
  error.name = 'StreamTransportError';
  return error;
}

beforeEach(() => {
  streamAnswer.mockReset();
  streamAnswer.mockResolvedValue(undefined);
  listSessionTasks.mockReset();
  listSessionTasks.mockResolvedValue([]);
});

describe('useAnswerConfirmation', () => {
  it('streams the answer with a generated message id', async () => {
    // The streaming route, not the unary one: a unary answer is held for the
    // backend's turn timeout and then reported pending, after which a turn that
    // never lands leaves the page nothing to show.
    const { result } = renderWith(agent);

    await act(async () => {
      await result.current.answer({
        taskId: 'task-1',
        decision: 'approve',
        answers: [['A rideable bike']],
        text: 'A rideable bike',
      });
    });

    expect(streamAnswer).toHaveBeenCalledWith(
      'gazelle',
      'abc',
      agent,
      {
        messageId: expect.any(String),
        taskId: 'task-1',
        decision: 'approve',
        answers: [['A rideable bike']],
        text: 'A rideable bike',
      },
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('refuses to answer when the session’s agent is unknown', async () => {
    // Without the agent there is no A2A endpoint to address, and guessing one
    // would strand the task it was trying to resume.
    const { result } = renderWithoutAgent();

    await act(async () => {
      await expect(
        result.current.answer({ taskId: 'task-1', decision: 'approve' }),
      ).rejects.toThrow(/agent for this session is unknown/);
    });

    expect(streamAnswer).not.toHaveBeenCalled();
  });

  it('refreshes the conversation, so the resumed turn shows up', async () => {
    const { result, invalidateQueries } = renderWith(agent);

    await act(async () => {
      await result.current.answer({ taskId: 'task-1', decision: 'approve' });
    });

    expect(invalidationFor(invalidateQueries, TASKS_KEY)).toBeDefined();
    expect(invalidationFor(invalidateQueries, SESSION_KEY)).toBeDefined();
  });

  it('holds the answer as pending until it lands', async () => {
    let release: () => void = () => {};
    streamAnswer.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    const { result } = renderWith(agent);

    act(() => {
      result.current
        .answer({ taskId: 'task-1', decision: 'approve', text: 'yes' })
        .catch(() => {});
    });

    await waitFor(() => {
      expect(result.current.pending?.text).toBe('yes');
    });

    await act(async () => {
      release();
    });

    await waitFor(() => {
      expect(result.current.pending).toBeNull();
    });
  });

  it('hands a failed answer back rather than losing the choices', async () => {
    streamAnswer.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith(agent);

    await act(async () => {
      await expect(
        result.current.answer({
          taskId: 'task-1',
          decision: 'approve',
          answers: [['A rideable bike']],
        }),
      ).rejects.toThrow('kagent said no');
    });

    await waitFor(() => {
      expect(result.current.failed?.answers).toEqual([['A rideable bike']]);
      expect(result.current.pending).toBeNull();
      expect(result.current.error?.message).toBe('kagent said no');
    });
  });

  describe('the resumed turn, streamed', () => {
    it('reports the stream lost when it ends before the resumed turn does', async () => {
      // The same classification as a sent message's stream, through the same
      // hook: the page says so in place of "Working…" while the poll takes over.
      streamAnswer.mockImplementation(
        async (_i, _s, _a, _answer, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1', status: { state: 'working' } });
        },
      );
      const { result } = renderWith(agent);
      expect(result.current.isStreamLost).toBe(false);

      await act(async () => {
        await result.current.answer({ taskId: 'task-1', decision: 'approve' });
      });

      expect(result.current.isStreamLost).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('exposes the turn’s events while it runs, and drops the preview once reconciled', async () => {
      let release: () => void = () => {};
      let emit: (event: unknown) => void = () => {};
      streamAnswer.mockImplementation(
        (_i, _s, _a, _answer, onEvent: (event: unknown) => void) =>
          new Promise<void>(resolve => {
            emit = onEvent;
            release = resolve;
          }),
      );

      const { result } = renderWith(agent);

      act(() => {
        void result.current.answer({ taskId: 'task-1', decision: 'approve' });
      });
      await waitFor(() => expect(result.current.isAnswering).toBe(true));

      // kagent's first event on a resumed task names it and says it is working
      // again — what lets the page retire the answer panel before the poll does.
      act(() =>
        emit({ kind: 'task', id: 'task-1', status: { state: 'working' } }),
      );
      await waitFor(() =>
        expect(result.current.stream).toMatchObject({
          dispatched: true,
          taskId: 'task-1',
          stateKey: 'working',
        }),
      );

      act(() =>
        emit({
          kind: 'status-update',
          final: true,
          status: {
            state: 'completed',
            message: {
              kind: 'message',
              messageId: 'reply-1',
              role: 'agent',
              parts: [{ kind: 'text', text: 'Done, after your decision.' }],
            },
          },
        }),
      );
      await waitFor(() =>
        expect(result.current.stream?.items).toEqual([
          expect.objectContaining({
            kind: 'agent-message',
            text: 'Done, after your decision.',
          }),
        ]),
      );

      await act(async () => {
        release();
      });

      await waitFor(() => expect(result.current.stream).toBeNull());
      expect(result.current.isAnswering).toBe(false);
    });

    it('resolves a stream cut after events, and leaves the turn to the poll', async () => {
      // The whole point of streaming the answer: a cut connection is not a
      // failed answer, and nothing here waits on a deadline of ours.
      streamAnswer.mockImplementation(
        async (_i, _s, _a, _answer, onEvent: (event: unknown) => void) => {
          onEvent({ kind: 'task', id: 'task-1' });
          throw transportError('the stream died');
        },
      );

      const { result, invalidateQueries } = renderWith(agent);

      await act(async () => {
        await result.current.answer({ taskId: 'task-1', decision: 'approve' });
      });

      expect(result.current.error).toBeNull();
      expect(invalidationFor(invalidateQueries, TASKS_KEY)).toBeDefined();
      expect(listSessionTasks).not.toHaveBeenCalled();
    });

    describe('an answer whose stream says nothing', () => {
      // The streaming route's 202, or a stream that ends without an event: a
      // resumed turn still running before its first event, or an answer kagent
      // never took. Only the session's history tells them apart.

      /** The answered task as a read returns it, in `state`, with `history`. */
      const answeredTask = (state: string, history: unknown[] = []) => ({
        id: 'task-1',
        status: { state },
        history,
      });
      /** The answer's own message, as the history holds it once taken. */
      const sentAnswer = () => ({
        messageId: streamAnswer.mock.calls[0][3].messageId,
      });

      beforeEach(() => {
        streamAnswer.mockResolvedValue(undefined);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('follows the turn through the poll once the history has the answer', async () => {
        listSessionTasks.mockImplementation(async () => [
          answeredTask('input-required', [sentAnswer()]),
        ]);
        const { result, invalidateQueries } = renderWith(agent);

        await act(async () => {
          await result.current.answer({
            taskId: 'task-1',
            decision: 'approve',
          });
        });

        expect(result.current.error).toBeNull();
        expect(result.current.failed).toBeNull();
        // The page's "following" state, not a failure.
        expect(result.current.isStreamLost).toBe(true);
        expect(listSessionTasks).toHaveBeenCalledTimes(1);
        expect(invalidationFor(invalidateQueries, TASKS_KEY)).toBeDefined();
      });

      it('follows the turn once the answered task has moved on', async () => {
        listSessionTasks.mockResolvedValue([answeredTask('working')]);
        const { result } = renderWith(agent);

        await act(async () => {
          await result.current.answer({
            taskId: 'task-1',
            decision: 'approve',
          });
        });

        expect(result.current.error).toBeNull();
        expect(listSessionTasks).toHaveBeenCalledTimes(1);
      });

      it('leaves a read that does not show the task to the poll', async () => {
        // Cannot tell: not grounds for calling the session dead.
        listSessionTasks.mockResolvedValue([]);
        const { result } = renderWith(agent);

        await act(async () => {
          await result.current.answer({
            taskId: 'task-1',
            decision: 'approve',
          });
        });

        expect(result.current.error).toBeNull();
      });

      it('reports an answer kagent did not take, instead of resolving silently', async () => {
        // The observed case: a three-day-old session took the answer with a
        // 202, and its task kept waiting with no answer in its history. The
        // button came back and nothing else happened.
        jest.useFakeTimers();
        listSessionTasks.mockResolvedValue([answeredTask('input-required')]);
        const { result } = renderWith(agent);

        let outcome: Promise<unknown> = Promise.resolve();
        act(() => {
          outcome = result.current
            .answer({
              taskId: 'task-1',
              decision: 'approve',
              answers: [['Activity-gated']],
              text: 'Activity-gated',
            })
            .catch(error => error);
        });
        await waitFor(() => expect(listSessionTasks).toHaveBeenCalled());
        expect(result.current.isAnswering).toBe(true);

        await act(async () => {
          await jest.advanceTimersByTimeAsync(
            ANSWER_TAKEN_WAIT_MS + ANSWER_TAKEN_POLL_MS,
          );
        });

        expect(isAnswerNotTakenError(await outcome)).toBe(true);
        await waitFor(() => {
          expect(isAnswerNotTakenError(result.current.error)).toBe(true);
          // Handed back, so the page can keep the person's words.
          expect(result.current.failed?.text).toBe('Activity-gated');
          expect(result.current.isAnswering).toBe(false);
        });
        expect(listSessionTasks).toHaveBeenCalledTimes(
          ANSWER_TAKEN_WAIT_MS / ANSWER_TAKEN_POLL_MS + 1,
        );
      });

      it('counts an answer that lands late as taken', async () => {
        jest.useFakeTimers();
        listSessionTasks
          .mockResolvedValueOnce([answeredTask('input-required')])
          .mockResolvedValueOnce([answeredTask('input-required')])
          .mockImplementation(async () => [
            answeredTask('working', [sentAnswer()]),
          ]);
        const { result } = renderWith(agent);

        let outcome: Promise<unknown> = Promise.resolve();
        act(() => {
          outcome = result.current
            .answer({ taskId: 'task-1', decision: 'approve' })
            .catch(error => error);
        });
        await act(async () => {
          await jest.advanceTimersByTimeAsync(ANSWER_TAKEN_WAIT_MS);
        });

        expect(await outcome).toBeUndefined();
        expect(listSessionTasks).toHaveBeenCalledTimes(3);
        expect(result.current.error).toBeNull();
      });

      it('does not call the session dead when every read failed', async () => {
        jest.useFakeTimers();
        listSessionTasks.mockRejectedValue(new Error('kagent is unreachable'));
        const { result } = renderWith(agent);

        let outcome: Promise<unknown> = Promise.resolve();
        act(() => {
          outcome = result.current
            .answer({ taskId: 'task-1', decision: 'approve' })
            .catch(error => error);
        });
        await act(async () => {
          await jest.advanceTimersByTimeAsync(
            ANSWER_TAKEN_WAIT_MS + ANSWER_TAKEN_POLL_MS,
          );
        });

        expect(await outcome).toBeUndefined();
        expect(result.current.error).toBeNull();
      });
    });

    it('verifies a transport failure before any event against the history', async () => {
      streamAnswer.mockRejectedValue(transportError('connection reset'));
      listSessionTasks.mockImplementation(async () => [
        { history: [{ messageId: streamAnswer.mock.calls[0][3].messageId }] },
      ]);

      const { result } = renderWith(agent);

      await act(async () => {
        await result.current.answer({ taskId: 'task-1', decision: 'approve' });
      });

      expect(result.current.error).toBeNull();
      expect(result.current.failed).toBeNull();
    });

    it('reports a decision as made, without a verification read', async () => {
      // A task that is no longer waiting is a 409 the backend decided; going to
      // look would only delay saying so.
      const refused = new Error('not waiting for a decision on this turn');
      refused.name = 'ConflictError';
      streamAnswer.mockRejectedValue(refused);

      const { result } = renderWith(agent);

      await act(async () => {
        await expect(
          result.current.answer({ taskId: 'task-1', decision: 'approve' }),
        ).rejects.toThrow(/not waiting/);
      });

      expect(listSessionTasks).not.toHaveBeenCalled();
      expect(result.current.stream).toBeNull();
    });
  });

  it('keeps a stable identity across re-renders', async () => {
    const { result, rerender } = renderWith(agent);
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
