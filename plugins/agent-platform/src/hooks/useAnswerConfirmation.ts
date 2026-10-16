import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import {
  A2aTaskWire,
  AWAITING_INPUT_STATES,
  describeSessionState,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { findTurnTask, useStreamedTurn } from './useStreamedTurn';
import { sessionTasksQueryKey } from './useSessionDetail';

/** One question's answers, positionally matched to the questions asked. */
export type QuestionAnswers = string[];

export type ConfirmationAnswer = {
  /** The suspended task being resumed. */
  taskId: string;
  decision: 'approve' | 'reject';
  /** Positional, one entry per question. Omitted for an approval. */
  answers?: QuestionAnswers[];
  rejectionReason?: string;
  /** The user's words, for the transcript. */
  text?: string;
  /**
   * The status message that asked (`PendingConfirmation.askedIn`). Kept here
   * only: never sent, it tells the question this answers apart from a later
   * one in the same task.
   */
  askedIn?: string;
};

/** An answer submitted locally, before kagent's copy of it has been read back. */
export type PendingAnswer = ConfirmationAnswer & { messageId: string };

/**
 * How long the session is read, after an answer whose stream said nothing,
 * before the answer counts as not taken; and how often within that.
 *
 * The backend answers 202 when the resumed turn sends no event within its
 * request timeout (10 s by default): an approved tool can run that long before
 * the agent speaks. But kagent answers the same way when it cannot resume the
 * session at all, and then the answer never reaches the task: a three-day-old
 * session took an answer that way, and its task was still waiting with no
 * answer in its history hours later. The two read apart only
 * in the history, so it is read: the answer in it, or the task moved on, means
 * taken. The grace covers a resume that records the answer late.
 */
export const ANSWER_TAKEN_WAIT_MS = 15_000;
export const ANSWER_TAKEN_POLL_MS = 3_000;

/**
 * The error an answer fails with when kagent did not take it: the question is
 * still open and the answer is not in the session. Terminal for this session:
 * sending it again goes the same way, so the page offers a new session instead
 * of a retry.
 */
export const ANSWER_NOT_TAKEN_ERROR_NAME = 'AnswerNotTakenError';

export function isAnswerNotTakenError(error: unknown): boolean {
  return (error as Error | undefined)?.name === ANSWER_NOT_TAKEN_ERROR_NAME;
}

function answerNotTakenError(): Error {
  const error = new Error(
    'kagent did not take the answer: the agent could not resume, and the question is still open.',
  );
  error.name = ANSWER_NOT_TAKEN_ERROR_NAME;
  return error;
}

type AnswerOutcome = 'taken' | 'waiting' | 'unknown';

/**
 * What one read of the session says about an answer: `taken` once the answer
 * is in the history or the task it answered has moved on, `waiting` while that
 * task still waits on the same request without it, `unknown` when the read
 * does not show the task.
 *
 * Moved on includes a new request in the same task: a follow-up question keeps
 * the task id, and it means the answer was taken whether or not the history
 * carries it under the id it was sent with.
 */
function readAnswerOutcome(
  tasks: A2aTaskWire[],
  answer: PendingAnswer,
): AnswerOutcome {
  if (findTurnTask(tasks, { sentMessageId: answer.messageId })) {
    return 'taken';
  }
  const task = tasks.find(entry => entry.id === answer.taskId);
  const state = task ? describeSessionState(task.status?.state) : undefined;
  if (!state) {
    return 'unknown';
  }
  if (!AWAITING_INPUT_STATES.has(state.key)) {
    return 'taken';
  }
  const asking = (task!.status?.message as { messageId?: unknown } | undefined)
    ?.messageId;
  return answer.askedIn && asking !== answer.askedIn ? 'taken' : 'waiting';
}

const delay = (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * Answer the confirmation a session is suspended on.
 *
 * Deliberately a separate hook from `useSendMessage` rather than a mode of it.
 * The two look similar and are not interchangeable: this one names a task and
 * resumes it, and the failure mode of confusing them is silent — the agent reads
 * the words, the suspended call never gets its response, and the session waits
 * forever. Keeping them apart means no caller can reach the resume path by
 * accident.
 *
 * The answer goes over A2A `message/stream` like a message does, and the
 * resumed turn's events are folded into the same live preview: the page shows
 * the agent's reaction as it happens, and a cut stream is visible as such. What
 * it replaces is the unary answer, which the backend held for its turn timeout
 * and then reported pending — after which a turn that never landed left the
 * page nothing to show. `useStreamedTurn` holds the shared part.
 *
 * The optimistic/failed contract mirrors `useSendMessage`: `pending` is the answer
 * on its way, dropped by *recognition* once a poll returns it, and `failed` hands
 * it back so the panel can restore what the user chose instead of losing it.
 *
 * **An answer whose stream says nothing is checked, not trusted.** A 202, or a
 * stream that ends without an event, is how a slow resumed turn arrives — and
 * also how an answer kagent never took does. The session is read until the
 * answer shows up in it (see {@link ANSWER_TAKEN_WAIT_MS}); one that does not
 * fails with {@link isAnswerNotTakenError}, which the page reports as a session
 * that cannot continue. Before this check that case resolved like a success:
 * the button came back and nothing on the page changed.
 */
export function useAnswerConfirmation(
  installation: string,
  sessionId: string,
  agent: { namespace: string; name: string } | undefined,
) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  const turn = useStreamedTurn(installation, sessionId);

  // The check below outlives a page the person left: it stops there, since
  // nothing would show its verdict.
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  /**
   * Whether kagent took an answer whose stream said nothing. False only when
   * the last read that succeeded, at the end of the wait, still showed the
   * task waiting without it. A read that does not show the task cannot tell,
   * nor can a wait whose reads all failed, and "cannot tell" is left to the
   * poll rather than reported as a session that cannot continue.
   *
   * Read through the conversation's own query, so the poll and this check
   * share their reads and a fresher one reaches the timeline too.
   */
  const wasAnswerTaken = useCallback(
    async (answer: PendingAnswer): Promise<boolean> => {
      const deadline = Date.now() + ANSWER_TAKEN_WAIT_MS;
      let lastKnown: AnswerOutcome | undefined;
      while (!unmountedRef.current) {
        try {
          lastKnown = readAnswerOutcome(
            await queryClient.fetchQuery({
              queryKey: sessionTasksQueryKey(installation, sessionId),
              queryFn: () =>
                kagentApi.listSessionTasks(installation, sessionId),
              staleTime: 0,
            }),
            answer,
          );
        } catch {
          // This read cannot tell; the next one may, and the last one that
          // could still stands.
        }
        if (lastKnown === 'taken' || lastKnown === 'unknown') {
          return true;
        }
        if (Date.now() >= deadline) {
          return lastKnown !== 'waiting';
        }
        await delay(ANSWER_TAKEN_POLL_MS);
      }
      return true;
    },
    [queryClient, kagentApi, installation, sessionId],
  );
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [failed, setFailed] = useState<PendingAnswer | null>(null);

  const { run, clear } = turn;
  const mutation = useTrackedMutation({
    event: null,
    untrackedReason:
      'A turn inside a running session; sessionStarted measures sessions.',
    mutationFn: async (answer: PendingAnswer) => {
      if (!agent) {
        throw new Error(
          'Cannot answer: the agent for this session is unknown.',
        );
      }
      const streamed = await run(answer.messageId, (onEvent, signal) =>
        kagentApi.streamAnswer(
          installation,
          sessionId,
          agent,
          answer,
          onEvent,
          signal,
        ),
      );
      if (!streamed.dispatched && !(await wasAnswerTaken(answer))) {
        throw answerNotTakenError();
      }
    },
    onSuccess: () => {
      setPending(null);
      setFailed(null);
      clear();
    },
    onError: (_error, answer) => {
      setPending(null);
      setFailed(answer);
      clear();
    },
  });

  const { mutateAsync, reset } = mutation;

  const answer = useCallback(
    async (submitted: ConfirmationAnswer) => {
      const withId: PendingAnswer = {
        ...submitted,
        messageId: crypto.randomUUID(),
      };
      setPending(withId);
      setFailed(null);
      await mutateAsync(withId);
    },
    [mutateAsync],
  );

  const { stream, isStreamLost } = turn;
  return useMemo(
    () => ({
      answer,
      // Covers the whole turn the answer sets off, exactly as `isSending` does —
      // so it drives a "working" indicator, not the panel's disabled state alone.
      isAnswering: mutation.isPending,
      pending,
      /**
       * The resumed turn as streamed so far, or null outside an answer and
       * after reconciliation — the same shape `useSendMessage` exposes, so the
       * page renders both previews through one path.
       */
      stream,
      /** The stream ended before the resumed turn did — see `useSendMessage`. */
      isStreamLost,
      failed,
      error: mutation.error as Error | null,
      reset,
    }),
    [
      answer,
      mutation.isPending,
      pending,
      stream,
      isStreamLost,
      failed,
      mutation.error,
      reset,
    ],
  );
}

export type UseAnswerConfirmationResult = ReturnType<
  typeof useAnswerConfirmation
>;
