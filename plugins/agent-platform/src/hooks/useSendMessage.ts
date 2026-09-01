import { useCallback, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isStreamTransportError, kagentApiRef } from '../apis';
import {
  applyStreamEvent,
  createStreamTurn,
  StreamTurn,
} from '../lib/kagentStreamTurn';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

/** A message submitted locally, before kagent's copy of it has been read back. */
export type PendingMessage = {
  /**
   * The id sent to kagent, so the stored message can be recognised when it
   * arrives and this stand-in dropped. Generated here rather than by kagent
   * precisely so it is known before the request is made.
   */
  messageId: string;
  text: string;
};

/**
 * Send a message to a session's agent, streaming the turn while it runs.
 *
 * The send goes over A2A `message/stream` (through the backend's relay), and the
 * events are folded into a {@link StreamTurn} the page renders as a live
 * preview of the reply — text as it is produced, tool calls as they happen.
 * The preview is exactly that: everything it shows is also written to the task
 * history, and once the turn has been reconciled (the awaited invalidation
 * below) the whole preview is dropped in favour of the polled conversation.
 * The poll therefore remains the source of truth, which is also what covers a
 * backgrounded tab — `refetchInterval` pauses there, but so does the need to
 * watch.
 *
 * **Losing the stream is not losing the message.** Gateways cut long-lived
 * responses (60 s on a stock route) and the turn survives the cut, so a stream
 * that dies after kagent produced *any* event resolves like a send whose 202
 * said "still running": reconcile and let the poll follow the turn. A failure
 * before any event is only reported once it is *known* to be a failure — a
 * transport error triggers one read of the session history to check whether the
 * `messageId` landed, mirroring the backend's verify-not-report rule for
 * `message/send`. A decision (a rejected message, an unknown agent, an in-band
 * A2A error before anything ran) is reported as made, never verified away.
 *
 * Shaped like {@link useRenameSession} beyond that — the mutation does its own
 * invalidation so `isPending` covers it — with the message the user just sent
 * kept as {@link PendingMessage} so the conversation shows it immediately.
 *
 * **`isPending` lasts as long as the stream**, which is the turn when nothing
 * cuts the connection and shorter when something does. It must not be used to
 * gate the composer or to mean "still saving": the session's own A2A state,
 * which the conversation poll keeps current, is the honest signal for "the
 * agent is working".
 *
 * The pending message is cleared on success — the invalidation is awaited, so by
 * then the conversation already contains kagent's copy — and on failure, where
 * nothing was recorded and the text belongs back in the composer. In between,
 * a poll may well deliver kagent's copy first; recognising it by `messageId` and
 * dropping the stand-in is the caller's job, because only the caller can see the
 * timeline.
 */
export function useSendMessage(
  installation: string,
  sessionId: string,
  agent: { namespace: string; name: string } | undefined,
) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [failed, setFailed] = useState<PendingMessage | null>(null);
  // The in-flight turn as streamed so far, or null outside a send. State for
  // the page to render; the ref lets the async mutation read the latest fold
  // without re-subscribing.
  const [stream, setStream] = useState<StreamTurn | null>(null);
  const streamRef = useRef<StreamTurn | null>(null);

  const setStreamTurn = useCallback((turn: StreamTurn | null) => {
    streamRef.current = turn;
    setStream(turn);
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
        return tasks.some(task =>
          (task.history ?? []).some(
            entry =>
              typeof entry === 'object' &&
              entry !== null &&
              (entry as { messageId?: unknown }).messageId === messageId,
          ),
        );
      } catch {
        return false;
      }
    },
    [kagentApi, installation, sessionId],
  );

  const mutation = useMutation({
    mutationFn: async (message: PendingMessage) => {
      if (!agent) {
        // Not a user-facing path: the composer is withheld when the session's
        // agent could not be resolved, because without its real namespace and
        // name there is nowhere to send. Guarded anyway so a future caller that
        // forgets gets an error instead of a request built from `undefined`.
        throw new Error(
          'Cannot send a message: the agent for this session is unknown.',
        );
      }

      let turn = createStreamTurn(message.messageId);
      setStreamTurn(turn);

      try {
        await kagentApi.streamMessage(
          installation,
          sessionId,
          agent,
          message,
          result => {
            turn = applyStreamEvent(turn, result);
            setStreamTurn(turn);
          },
        );
      } catch (error) {
        // Any event at all means the turn exists — a later failure only cut
        // the preview short, and the poll finishes the job.
        if (!turn.dispatched) {
          if (
            !isStreamTransportError(error) ||
            !(await messageLanded(message.messageId))
          ) {
            throw error;
          }
        }
      }

      // The conversation, which now holds the turn (finished or still
      // running). Awaited inside `mutationFn` so the stand-in — and the stream
      // preview — are only dropped once the real content is readable.
      await queryClient.invalidateQueries({
        queryKey: sessionTasksQueryKey(installation, sessionId),
      });

      // The session object too: a turn moves `updated_at`, which the header shows
      // as the last activity.
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKey(installation, sessionId),
      });
    },
    onSuccess: () => {
      setPending(null);
      setFailed(null);
      // The reconciled conversation is on screen by now; keeping the preview
      // would double whatever the turn produced.
      setStreamTurn(null);
    },
    // The stand-in goes — nothing was recorded, so the transcript must not keep
    // showing a message that was never sent — but the *text* is handed back, because
    // the composer cleared itself on submit and this is the only remaining copy.
    // Losing a pasted manifest to a 502 is exactly what the generous length limit
    // exists to permit.
    onError: (_error, message) => {
      setPending(null);
      setFailed(message);
      setStreamTurn(null);
    },
  });

  const { mutateAsync, reset } = mutation;

  const sendMessage = useCallback(
    async (text: string) => {
      const message: PendingMessage = {
        messageId: crypto.randomUUID(),
        text,
      };
      setPending(message);
      setFailed(null);
      await mutateAsync(message);
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      sendMessage,
      /** True while the stream lives — usually the turn. See the note above. */
      isSending: mutation.isPending,
      pending,
      /**
       * The in-flight turn as streamed so far: completed items plus the text
       * still being produced. Null outside a send and after reconciliation.
       */
      stream,
      /**
       * The last message that failed to send, so its text can be given back to
       * the composer. Distinct `messageId` per attempt, which is what lets the
       * same text be restored again after a second failure.
       */
      failed,
      error: mutation.error as Error | null,
      reset,
    }),
    [
      sendMessage,
      mutation.isPending,
      pending,
      stream,
      failed,
      mutation.error,
      reset,
    ],
  );
}

/** What {@link useSendMessage} hands to the composer. */
export type UseSendMessageResult = ReturnType<typeof useSendMessage>;
