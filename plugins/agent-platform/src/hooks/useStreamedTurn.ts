import { useCallback, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { isStreamTransportError, kagentApiRef } from '../apis';
import {
  applyStreamEvent,
  createStreamTurn,
  StreamTurn,
} from '../lib/kagentStreamTurn';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

/**
 * Opens the stream for one turn, handing each event to `onEvent`; resolves
 * when the stream ends, which is not necessarily when the turn does.
 */
export type OpenTurnStream = (
  onEvent: (result: unknown) => void,
) => Promise<void>;

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
 * responses (60 s on a stock route) and the turn survives the cut, so a stream
 * that dies after kagent produced *any* event resolves like a 202 that said
 * "still running": reconcile and let the poll follow the turn. A failure before
 * any event is only reported once it is *known* to be a failure — a transport
 * error triggers one read of the session history to check whether the
 * `messageId` landed, mirroring the backend's verify-not-report rule for
 * `message/send`. A decision (a rejected message, an unknown agent, a session
 * still busy with the previous turn, an in-band A2A error before anything ran)
 * is reported as made, never verified away.
 */
export function useStreamedTurn(installation: string, sessionId: string) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  // The in-flight turn as streamed so far, or null outside a send. State for
  // the page to render; the ref lets the async run read the latest fold without
  // re-subscribing.
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

  /**
   * Run one streamed turn to the end of its stream, then re-read the
   * conversation. Rejects only with a failure that is known to be one.
   */
  const run = useCallback(
    async (messageId: string, open: OpenTurnStream) => {
      let turn = createStreamTurn(messageId);
      setStreamTurn(turn);

      try {
        await open(result => {
          turn = applyStreamEvent(turn, result);
          setStreamTurn(turn);
        });
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
      }

      // The conversation, which now holds the turn (finished or still
      // running). Awaited here so the caller's stand-in — and the stream
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
    [installation, sessionId, messageLanded, queryClient, setStreamTurn],
  );

  /** Drop the preview: the reconciled conversation is on screen, or the send failed. */
  const clear = useCallback(() => setStreamTurn(null), [setStreamTurn]);

  return useMemo(() => ({ stream, run, clear }), [stream, run, clear]);
}
