import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { hashKey, Query, useQueryClient } from '@tanstack/react-query';
import {
  A2aTaskWire,
  AWAITING_INPUT_STATES,
  describeSessionState,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { isStreamTransportError, kagentApiRef } from '../apis';
import {
  applyStreamEvent,
  createStreamTurn,
  isStreamTurnOver,
  StreamTurn,
} from '../lib/kagentStreamTurn';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

/**
 * Opens the stream for one turn, handing each event to `onEvent`; resolves
 * when the stream ends, which is not necessarily when the turn does. `signal`
 * aborts the stream — pulled when the poll shows the turn over while the stream
 * is still open.
 */
export type OpenTurnStream = (
  onEvent: (result: unknown) => void,
  signal: AbortSignal,
) => Promise<void>;

/** A turn whose stream ended before the turn did, and when. */
type LostStream = {
  turn: StreamTurn;
  /** Epoch ms the stream ended: a conversation read from before it cannot say how the turn went on. */
  at: number;
};

/**
 * The task a turn runs as: the one the stream named, else the one whose
 * history holds the message that opened the turn.
 */
function findTurnTask(
  tasks: A2aTaskWire[],
  turn: { sentMessageId: string; taskId?: string },
): A2aTaskWire | undefined {
  return tasks.find(
    task =>
      (turn.taskId !== undefined && task.id === turn.taskId) ||
      (task.history ?? []).some(
        entry =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as { messageId?: unknown }).messageId === turn.sentMessageId,
      ),
  );
}

/**
 * Whether a task will still produce output on its own — active, and not
 * waiting on a human. The complement is what ends a stream's usefulness: a
 * finished, failed, cancelled or suspended task has nothing left to preview.
 */
function isTaskWorking(task: A2aTaskWire): boolean {
  const state = describeSessionState(task.status?.state);
  return Boolean(state?.isActive) && !AWAITING_INPUT_STATES.has(state!.key);
}

/**
 * The part of a streamed turn that is the same whatever opened it.
 *
 * A plain message and an answer to a confirmation are different acts — one
 * starts a task, the other resumes a named one, and `useSendMessage` and
 * `useAnswerConfirmation` stay separate hooks so no caller reaches the resume
 * path by accident — but once the stream is open they are one thing: events
 * folded into a {@link StreamTurn} the page renders as a live preview, a
 * transport failure verified against the session history rather than reported,
 * and the conversation re-read once the stream ends. This hook holds that one
 * thing, so the two cannot drift in how they follow a turn.
 *
 * **Losing the stream is not losing the message.** Gateways cut long-lived
 * responses (60 s on a stock route, 15 s on Envoy Gateway's default) and the
 * turn survives the cut, so a stream that dies after kagent produced *any* event
 * resolves like a 202 that said "still running": reconcile and let the poll
 * follow the turn. A failure before any event is only reported once it is
 * *known* to be a failure — a transport error triggers one read of the session
 * history to check whether the `messageId` landed, mirroring the backend's
 * verify-not-report rule for `message/send`. A decision (a rejected message, an
 * unknown agent, a session still busy with the previous turn, an in-band A2A
 * error before anything ran) is reported as made, never verified away.
 *
 * **Losing the stream is not "still working" either.** A stream that ends —
 * cleanly, by a cut, or by an in-band error — before it has delivered the end
 * of the turn is reported as **lost** ({@link isStreamLost}), from the moment
 * it ends until a conversation read from after that moment shows the turn no
 * longer working. The page says so in place of "Working…": the preview stopped
 * mid-sentence, and a spinner alone would promise a continuation that is not
 * coming through the stream. The finished reply arrives through the poll.
 *
 * **A stream that hangs is ended from here.** The conversation poll keeps
 * running beside the stream, and while the stream is open every successful read
 * is checked: once the turn's own task is no longer working, the stream is
 * aborted — the request had nothing more to say, and left open it would have
 * kept the page on "Working…" over a finished turn for as long as the tab
 * lived. A turn that is genuinely running is never touched: its task reads as
 * working, and the stream stays.
 */
export function useStreamedTurn(installation: string, sessionId: string) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  // The in-flight turn as streamed so far, or null outside a send. State for
  // the page to render; the ref lets the async run read the latest fold without
  // re-subscribing.
  const [stream, setStream] = useState<StreamTurn | null>(null);
  const streamRef = useRef<StreamTurn | null>(null);
  // The turn whose stream ended before it did, until the poll shows it over.
  // Outlives `stream`, which is cleared as soon as the conversation has been
  // re-read — exactly when the fallback this records is under way.
  const [lost, setLost] = useState<LostStream | null>(null);
  const lostRef = useRef<LostStream | null>(null);
  // Ends the stream in flight. Null outside a stream.
  const abortRef = useRef<AbortController | null>(null);

  const setStreamTurn = useCallback((turn: StreamTurn | null) => {
    streamRef.current = turn;
    setStream(turn);
  }, []);
  const setLostStream = useCallback((value: LostStream | null) => {
    lostRef.current = value;
    setLost(value);
  }, []);

  /**
   * Whether the message reached the session's history — the question a
   * transport failure leaves open. A read failure answers "cannot tell", which
   * keeps the original error: "cannot tell" must not be read as "it worked".
   */
  const messageLanded = useCallback(
    async (messageId: string): Promise<boolean> => {
      try {
        const tasks = await kagentApi.listSessionTasks(installation, sessionId);
        return findTurnTask(tasks, { sentMessageId: messageId }) !== undefined;
      } catch {
        return false;
      }
    },
    [kagentApi, installation, sessionId],
  );

  /**
   * Whether the conversation as last read shows the turn's task no longer
   * working. A task never returns to working from there, so a read from
   * before the stream ended is as good as one from after.
   */
  const pollShowsTurnOver = useCallback(
    (turn: StreamTurn): boolean => {
      const tasks = queryClient.getQueryData<A2aTaskWire[]>(
        sessionTasksQueryKey(installation, sessionId),
      );
      const task = tasks ? findTurnTask(tasks, turn) : undefined;
      return task !== undefined && !isTaskWorking(task);
    },
    [queryClient, installation, sessionId],
  );

  /**
   * Run one streamed turn to the end of its stream, then re-read the
   * conversation. Rejects only with a failure that is known to be one.
   */
  const run = useCallback(
    async (messageId: string, open: OpenTurnStream) => {
      let turn = createStreamTurn(messageId);
      setStreamTurn(turn);
      // A new turn: whatever became of the previous one's stream is history.
      setLostStream(null);
      const control = new AbortController();
      abortRef.current = control;

      try {
        await open(result => {
          turn = applyStreamEvent(turn, result);
          setStreamTurn(turn);
        }, control.signal);
      } catch (error) {
        // Any event at all means the turn exists — a later failure only cut
        // the preview short, and the poll finishes the job.
        if (!turn.dispatched) {
          if (
            !isStreamTransportError(error) ||
            !(await messageLanded(messageId))
          ) {
            throw error;
          }
        }
      } finally {
        abortRef.current = null;
      }

      // The stream is over; the turn may not be. Recorded before the re-read
      // below, so the page can say "checking" for exactly as long as it runs —
      // unless the conversation in hand already shows the turn over, which is
      // how a stream ended from here (see the subscription below) arrives: the
      // outcome is known, and there is nothing to check.
      if (!isStreamTurnOver(turn) && !pollShowsTurnOver(turn)) {
        setLostStream({ turn, at: Date.now() });
      }

      // The conversation, which now holds the turn (finished or still
      // running). Awaited here so the caller's stand-in — and the stream
      // preview — are only dropped once the real content is readable.
      await queryClient.invalidateQueries({
        queryKey: sessionTasksQueryKey(installation, sessionId),
      });

      // The session object too: a turn can change its lifecycle `state` and
      // `failure`, which is how kagent reports a lost runtime.
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKey(installation, sessionId),
      });
    },
    [
      installation,
      sessionId,
      messageLanded,
      pollShowsTurnOver,
      queryClient,
      setStreamTurn,
      setLostStream,
    ],
  );

  // Follow the conversation poll while a stream is open or lost. Every
  // successful read of the session's tasks is checked against the turn in hand:
  // it ends a stream whose turn the poll shows over, and it retires a loss once
  // a read from after the loss shows the turn no longer working — or not there
  // at all, in which case there is nothing to follow. Subscribed to the cache
  // rather than observed with `useQuery`, so this adds no second set of query
  // options to the read `useSessionDetail` owns.
  const isStreaming = stream !== null;
  const isLost = lost !== null;
  const tasksQueryHash = useMemo(
    () => hashKey(sessionTasksQueryKey(installation, sessionId)),
    [installation, sessionId],
  );
  useEffect(() => {
    if (!isStreaming && !isLost) {
      return undefined;
    }
    const check = (query: Query) => {
      const tasks = query.state.data as A2aTaskWire[] | undefined;
      if (!tasks) {
        return;
      }
      const running = streamRef.current;
      if (running && abortRef.current) {
        const task = findTurnTask(tasks, running);
        if (task && !isTaskWorking(task)) {
          abortRef.current.abort();
        }
      }
      const lostNow = lostRef.current;
      if (lostNow && query.state.dataUpdatedAt >= lostNow.at) {
        const task = findTurnTask(tasks, lostNow.turn);
        if (!task || !isTaskWorking(task)) {
          setLostStream(null);
        }
      }
    };
    return queryClient.getQueryCache().subscribe(event => {
      if (
        event.query.queryHash === tasksQueryHash &&
        event.type === 'updated' &&
        event.action.type === 'success'
      ) {
        check(event.query);
      }
    });
  }, [isStreaming, isLost, queryClient, tasksQueryHash, setLostStream]);

  /** Drop the preview: the reconciled conversation is on screen, or the send failed. */
  const clear = useCallback(() => setStreamTurn(null), [setStreamTurn]);

  return useMemo(
    () => ({ stream, isStreamLost: isLost, run, clear }),
    [stream, isLost, run, clear],
  );
}
