import { useCallback, useMemo, useState } from 'react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import {
  A2aTaskWire,
  countSendTimeout,
  SendTimeouts,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { isFirstEventTimeout, kagentApiRef } from '../apis';
import { useStreamedTurn } from './useStreamedTurn';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';
import { ComposerImage, toMessageImages } from '../lib/messageImages';

/** A message submitted locally, before kagent's copy of it has been read back. */
export type PendingMessage = {
  /**
   * The id sent to kagent, so the stored message can be recognised when it
   * arrives and this stand-in dropped. Generated here rather than by kagent
   * precisely so it is known before the request is made.
   */
  messageId: string;
  text: string;
  /**
   * The images attached to it, shown with the stand-in and handed back to the
   * composer with the text when the send fails.
   */
  images?: ComposerImage[];
};

/**
 * Send a message to a session's agent, streaming the turn while it runs.
 *
 * The send goes over A2A `message/stream` (through the backend's relay), and the
 * events are folded into a `StreamTurn` the page renders as a live preview of
 * the reply — text as it is produced, tool calls as they happen. The preview is
 * exactly that: everything it shows is also written to the task history, and
 * once the turn has been reconciled (the awaited invalidation in
 * `useStreamedTurn`) the whole preview is dropped in favour of the polled
 * conversation. The poll therefore remains the source of truth, which is also
 * what covers a backgrounded tab — `refetchInterval` pauses there, but so does
 * the need to watch.
 *
 * How a lost stream is classified — verified against the history, or reported
 * as a decision — is `useStreamedTurn`'s, shared with the answer path. So is
 * noticing that the stream ended before the turn did (`isStreamLost`), which the
 * page says in place of "Working…" while the poll takes over.
 *
 * Shaped like `useRenameSession` beyond that — the mutation does its own
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
 *
 * **Sends that keep timing out are counted** ({@link SendTimeouts}): a send the
 * backend gave up on before kagent's first event, whose message did not land,
 * adds one; any other outcome ends the run. A runtime that crashes on every
 * restore shows nowhere else — the session stays ready and the sends never
 * become turns — so the page reads the run (`readSendTimeoutRuntimeLoss`).
 * Each such failure also re-reads the session and its conversation, so a
 * `RUNTIME_LOST` kagent has recorded since takes the reported path.
 */
export function useSendMessage(
  installation: string,
  sessionId: string,
  agent: { namespace: string; name: string } | undefined,
) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  const turn = useStreamedTurn(installation, sessionId);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [failed, setFailed] = useState<PendingMessage | null>(null);
  const [timeouts, setTimeouts] = useState<SendTimeouts | undefined>(undefined);

  const { run, clear } = turn;
  const mutation = useTrackedMutation({
    // Neither the text nor its images: only that a message went.
    event: () => ({ name: 'AgentPlatform.messageSent', attributes: {} }),
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
      await run(message.messageId, (onEvent, signal) =>
        kagentApi.streamMessage(
          installation,
          sessionId,
          agent,
          {
            messageId: message.messageId,
            text: message.text,
            ...(message.images?.length
              ? { images: toMessageImages(message.images) }
              : {}),
          },
          onEvent,
          signal,
        ),
      );
    },
    onSuccess: () => {
      setPending(null);
      setFailed(null);
      setTimeouts(undefined);
      // The reconciled conversation is on screen by now; keeping the preview
      // would double whatever the turn produced.
      clear();
    },
    // The stand-in goes — nothing was recorded, so the transcript must not keep
    // showing a message that was never sent — but the *text* is handed back, because
    // the composer cleared itself on submit and this is the only remaining copy
    // (of the images too).
    // Losing a pasted manifest to a 502 is exactly what the generous length limit
    // exists to permit.
    onError: (error, message) => {
      setPending(null);
      setFailed(message);
      clear();
      if (!isFirstEventTimeout(error)) {
        setTimeouts(undefined);
        return;
      }
      // Counted against the conversation as last read: a turn created since
      // the run began ends it.
      const tasks = queryClient.getQueryData<A2aTaskWire[]>(
        sessionTasksQueryKey(installation, sessionId),
      );
      setTimeouts(previous => countSendTimeout(previous, tasks));
      for (const queryKey of [
        sessionQueryKey(installation, sessionId),
        sessionTasksQueryKey(installation, sessionId),
      ]) {
        queryClient.invalidateQueries({ queryKey }).catch(() => {});
      }
    },
  });

  const { mutateAsync, reset } = mutation;

  const sendMessage = useCallback(
    async (text: string, images?: ComposerImage[]) => {
      const message: PendingMessage = {
        messageId: crypto.randomUUID(),
        text,
        ...(images?.length ? { images } : {}),
      };
      setPending(message);
      setFailed(null);
      await mutateAsync(message);
    },
    [mutateAsync],
  );

  const { stream, isStreamLost } = turn;
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
       * The stream ended before the turn did, and the poll has not yet shown
       * that turn over. What the page says instead of "Working…" meanwhile.
       */
      isStreamLost,
      /**
       * The last message that failed to send, so its text can be given back to
       * the composer. Distinct `messageId` per attempt, which is what lets the
       * same text be restored again after a second failure.
       */
      failed,
      error: mutation.error as Error | null,
      /**
       * The sends in a row that timed out before kagent's first event and did
       * not land; undefined once one lands or fails otherwise.
       */
      timeouts,
      reset,
    }),
    [
      sendMessage,
      mutation.isPending,
      pending,
      stream,
      isStreamLost,
      failed,
      mutation.error,
      timeouts,
      reset,
    ],
  );
}

/** What {@link useSendMessage} hands to the composer. */
export type UseSendMessageResult = ReturnType<typeof useSendMessage>;
