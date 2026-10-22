import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { hashKey, Query, useQueryClient } from '@tanstack/react-query';
import {
  A2aTaskWire,
  AWAITING_INPUT_STATES,
  describeSessionState,
  isRuntimeLostFailureText,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  isResubscribeRetryable,
  isStreamTransportError,
  kagentApiRef,
  StreamEnd,
} from '../apis';
import {
  applyStreamEvent,
  createStreamTurn,
  isStreamTurnOver,
  isTaskSnapshotEvent,
  resumeStreamTurn,
  StreamTurn,
} from '../lib/kagentStreamTurn';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

/**
 * Opens the stream for one turn, handing each event to `onEvent`; resolves
 * when the stream ends, which is not necessarily when the turn does. `signal`
 * aborts the stream — pulled when the poll shows the turn over while the stream
 * is still open, and when the hook's page unmounts once the turn is dispatched.
 */
export type OpenTurnStream = (
  onEvent: (result: unknown) => void,
  signal: AbortSignal,
) => Promise<StreamEnd | void>;

/**
 * How long to wait before each resubscription to a turn whose stream ended
 * before it did: at once, then backing off to 7 s in all, after which the poll
 * takes over. Short, because a controller rollout has its new pod serving
 * before the old one is cut and the reader is watching; bounded, because a
 * controller that is not coming back must not keep the page saying
 * "Reconnecting…". A subscription that delivered the turn's own events starts
 * the count again, so a turn cut twice is picked up twice.
 */
export const RESUBSCRIBE_DELAYS_MS = [0, 1000, 2000, 4000];

/**
 * The most resubscriptions one turn makes, however many delivered events: a
 * guard against a stream that opens, says one thing and is cut, forever.
 */
export const MAX_RESUBSCRIBES = 30;

/** Resolve after `ms`, or at once when `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    // The timer outliving an abort only resolves a settled promise again.
    const onAbort = () => resolve();
    signal.addEventListener('abort', onAbort, { once: true });
    setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}

/**
 * Called when a send failed before any event, the session history was read to
 * check it, and the message is not there — with that read, which is fresher
 * than the poll's. Not called when the message landed, nor when the history
 * could not be read: "cannot tell" is not "did not land".
 */
export type OnMessageMissing = (tasks: A2aTaskWire[]) => void;

/** What a read of the session history says of a sent message. */
type Landing =
  | { kind: 'landed' }
  | { kind: 'missing'; tasks: A2aTaskWire[] }
  | { kind: 'unknown' };

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
export function findTurnTask(
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
 * Whether the stream left the turn waiting on the person: a v1 pause ends the
 * stream with no final flag, and the answer panel, not a resubscription, is
 * what moves the turn on.
 */
function awaitsPerson(turn: StreamTurn): boolean {
  const key = describeSessionState(turn.stateKey)?.key;
  return key !== undefined && AWAITING_INPUT_STATES.has(key);
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
 * **A cut stream is picked up again.** A stream that ends — cleanly, by a
 * cut, or by an in-band error — before it has delivered the end of the turn
 * is followed again by resubscribing to the turn's task (A2A
 * `SubscribeToTask`, `KagentApi.subscribeToTask`): a kagent controller
 * rollout cuts every stream in flight while the turns run on. The
 * resubscription's events fold into the same {@link StreamTurn}, so the
 * preview continues where it stopped, and the conversation is re-read as it
 * opens to bring in what was said while no stream was open. Meanwhile
 * {@link isReconnecting} is true, with a short bounded backoff
 * ({@link RESUBSCRIBE_DELAYS_MS}). A decision (not the person's turn, a turn
 * already over) ends the retries at once, and a stream that ended with a lost
 * runtime's words is not resubscribed at all: the turn failed with it, and
 * the re-read shows the runtime loss, not a lost stream.
 *
 * **Losing the stream is not "still working" either.** A stream that could
 * not be picked up again is reported as **lost** ({@link isStreamLost}), from
 * the moment the last attempt ends until a conversation read from after that
 * moment shows the turn no longer working. The page says so in place of
 * "Working…": the preview stopped mid-sentence, and a spinner alone would
 * promise a continuation that is not coming through the stream. The finished
 * reply arrives through the poll.
 *
 * **A stream that hangs is ended from here.** The conversation poll keeps
 * running beside the stream, and while the stream is open every successful read
 * is checked: once the turn's own task is no longer working, the stream is
 * aborted — the request had nothing more to say, and left open it would have
 * kept the page on "Working…" over a finished turn for as long as the tab
 * lived. A turn that is genuinely running is never touched: its task reads as
 * working, and the stream stays.
 */
export function useStreamedTurn(
  installation: string,
  sessionId: string,
  /**
   * The session's Agent, which a resubscription is addressed to, as the
   * stream was. Without it a cut stream is not picked up again.
   */
  agent?: { namespace: string; name: string },
) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  // Read at the cut rather than captured by `run`, which keeps its identity.
  const agentRef = useRef(agent);
  agentRef.current = agent;
  // A cut stream is being picked up again: between the cut and the
  // resubscription's first event.
  const [isReconnecting, setReconnecting] = useState(false);
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
  // Leaving the page (the rail, the palette, Back) ends the stream in flight
  // (R2-3): nothing reads it any more, and left open it holds one of the
  // browser's few connections per host until the gateway cuts it. Only once
  // the turn is dispatched, though: the turn survives a client abort from
  // then on, and the next visit's poll follows it, but before its first event
  // the backend relay aborts its upstream request too, and the message may
  // never reach kagent. A stream left before that is ended by `run` at its
  // first event instead.
  const unmountedRef = useRef(false);
  // What the page read of the conversation predates the turn it leaves
  // behind, and the client trusts a read for a minute (`staleTime`), so a
  // visit back within it — from the rail, or a toast saying the agent now
  // waits — would show the conversation as it was before the turn (for a new
  // session: "no messages yet") until the next poll. Marking both reads stale
  // makes that visit read afresh; nothing is fetched now, with no page to show
  // it.
  const markLeftBehind = useCallback(() => {
    for (const queryKey of [
      sessionTasksQueryKey(installation, sessionId),
      sessionQueryKey(installation, sessionId),
    ]) {
      queryClient
        .invalidateQueries({ queryKey, refetchType: 'none' })
        .catch(() => {});
    }
  }, [queryClient, installation, sessionId]);
  const markLeftBehindRef = useRef(markLeftBehind);
  markLeftBehindRef.current = markLeftBehind;
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (streamRef.current) {
        markLeftBehindRef.current();
      }
      if (streamRef.current?.dispatched) {
        abortRef.current?.abort();
      }
    };
  }, []);

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
   * keeps the original error: "cannot tell" must not be read as "it worked",
   * nor as "it did not land".
   */
  const readLanding = useCallback(
    async (messageId: string): Promise<Landing> => {
      let tasks: A2aTaskWire[];
      try {
        tasks = await kagentApi.listSessionTasks(installation, sessionId);
      } catch {
        return { kind: 'unknown' };
      }
      return findTurnTask(tasks, { sentMessageId: messageId })
        ? { kind: 'landed' }
        : { kind: 'missing', tasks };
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
   * Run one streamed turn to the end of its stream — picked up again as long
   * as it is cut before the turn ends — then re-read the conversation. Rejects only with a failure that is known to be one.
   * Resolves with the turn as streamed, so a caller can tell a stream that
   * said nothing at all (`dispatched` false) from one that carried the turn.
   * `onMissing` hears a failure the history confirmed did not land.
   */
  const run = useCallback(
    async (
      messageId: string,
      open: OpenTurnStream,
      onMissing?: OnMessageMissing,
    ): Promise<StreamTurn> => {
      let turn = createStreamTurn(messageId);
      setStreamTurn(turn);
      // A new turn: whatever became of the previous one's stream is history.
      setLostStream(null);
      const control = new AbortController();
      abortRef.current = control;

      // How the last stream of the turn ended.
      let end: StreamEnd = {};
      const fold = (result: unknown) => {
        const carriedFile = turn.carriesFile;
        turn = applyStreamEvent(turn, result);
        if (unmountedRef.current) {
          // Left before the first event: dispatched now, so the stream can
          // go without taking the message with it.
          control.abort();
          return;
        }
        setStreamTurn(turn);
        if (turn.carriesFile && !carriedFile) {
          // Not awaited: the stream keeps flowing while the poll catches up.
          void queryClient.invalidateQueries({
            queryKey: sessionTasksQueryKey(installation, sessionId),
          });
        }
      };

      /**
       * Follow the turn again for as long as its stream keeps ending before
       * it does — see "A cut stream is picked up again" above. Leaves `turn`
       * and `end` as the last stream left them.
       */
      const followAgain = async () => {
        let failures = 0;
        for (let attempt = 0; attempt < MAX_RESUBSCRIBES; attempt += 1) {
          const target = agentRef.current;
          const taskId = turn.taskId;
          if (
            !target ||
            !taskId ||
            !turn.dispatched ||
            isStreamTurnOver(turn) ||
            awaitsPerson(turn) ||
            isRuntimeLostFailureText(end.error) ||
            control.signal.aborted ||
            unmountedRef.current ||
            failures >= RESUBSCRIBE_DELAYS_MS.length ||
            pollShowsTurnOver(turn)
          ) {
            return;
          }
          setReconnecting(true);
          await pause(RESUBSCRIBE_DELAYS_MS[failures], control.signal);
          if (control.signal.aborted || unmountedRef.current) {
            return;
          }
          turn = resumeStreamTurn(turn);
          setStreamTurn(turn);
          let opened = false;
          let progressed = false;
          try {
            end =
              (await kagentApi.subscribeToTask(
                installation,
                sessionId,
                target,
                taskId,
                result => {
                  if (!opened) {
                    opened = true;
                    setReconnecting(false);
                    // What the turn said while no stream was open is in its
                    // history: the poll brings it in, the preview goes on.
                    void queryClient.invalidateQueries({
                      queryKey: sessionTasksQueryKey(installation, sessionId),
                    });
                  }
                  progressed ||= !isTaskSnapshotEvent(result);
                  fold(result);
                },
                control.signal,
              )) ?? {};
          } catch (error) {
            if (!isResubscribeRetryable(error)) {
              return;
            }
            end = {};
          }
          failures = progressed ? 0 : failures + 1;
        }
      };

      try {
        try {
          end = (await open(fold, control.signal)) ?? {};
        } catch (error) {
          // Any event at all means the turn exists — a later failure only cut
          // the preview short, and the poll finishes the job (an abort because
          // the page went away comes only after one). A failure before any
          // event is reported even after the page went away: it is not ours.
          if (!turn.dispatched) {
            if (!isStreamTransportError(error)) {
              throw error;
            }
            const landing = await readLanding(messageId);
            if (landing.kind === 'missing') {
              onMissing?.(landing.tasks);
            }
            if (landing.kind !== 'landed') {
              throw error;
            }
          }
        }
        await followAgain();
      } finally {
        abortRef.current = null;
        setReconnecting(false);
      }

      // Gone from the page: nothing here renders the outcome. The turn is
      // dispatched by now (or failed), so the next visit must read the
      // conversation afresh rather than trust the read from before it.
      if (unmountedRef.current) {
        markLeftBehindRef.current();
        return turn;
      }

      // The stream is over; the turn may not be. Recorded before the re-read
      // below, so the page can say "checking" for exactly as long as it runs —
      // unless the conversation in hand already shows the turn over, which is
      // how a stream ended from here (see the subscription below) arrives: the
      // outcome is known, and there is nothing to check. Nor is a lost runtime
      // a lost stream: the turn failed with it, and the re-read shows how.
      if (
        !isStreamTurnOver(turn) &&
        !isRuntimeLostFailureText(end.error) &&
        !pollShowsTurnOver(turn)
      ) {
        setLostStream({ turn, at: Date.now() });
      }

      // The conversation, which now holds the turn (finished or still
      // running), and the session object too: a turn can change its lifecycle
      // `state` and `failure`, which is how kagent reports a lost runtime.
      // Awaited here so the caller's stand-in — and the stream preview — are
      // only dropped once the real content is readable. A read still in flight
      // began before the turn ended — a new session's first read, against a
      // turn that ended at once — and an invalidation would join it rather
      // than read again, so it is called off first.
      for (const queryKey of [
        sessionTasksQueryKey(installation, sessionId),
        sessionQueryKey(installation, sessionId),
      ]) {
        await queryClient.cancelQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey });
      }
      return turn;
    },
    [
      installation,
      sessionId,
      kagentApi,
      readLanding,
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
    () => ({ stream, isReconnecting, isStreamLost: isLost, run, clear }),
    [stream, isReconnecting, isLost, run, clear],
  );
}
