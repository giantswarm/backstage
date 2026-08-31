import { useCallback, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
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
 * Send a message to a session's agent.
 *
 * Shaped like {@link useRenameSession} — the mutation does its own invalidation
 * so `isPending` covers it — with one addition: the message the user just sent is
 * kept here as {@link PendingMessage} so the conversation can show it
 * immediately.
 *
 * **`isPending` lasts as long as the agent's turn**, which can be minutes:
 * kagent's `message/send` answers only when the agent finishes. So it must not be
 * used to gate the composer or to mean "still saving". The session's own A2A
 * state, which the conversation poll keeps current, is the honest signal for
 * "the agent is working".
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

      await kagentApi.sendMessage(installation, sessionId, agent, message);

      // The conversation, which now holds the turn. Awaited inside `mutationFn`
      // so the stand-in is only dropped once the real message is readable.
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
    },
    // The stand-in goes — nothing was recorded, so the transcript must not keep
    // showing a message that was never sent — but the *text* is handed back, because
    // the composer cleared itself on submit and this is the only remaining copy.
    // Losing a pasted manifest to a 502 is exactly what the generous length limit
    // exists to permit.
    onError: (_error, message) => {
      setPending(null);
      setFailed(message);
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
      /** True for the whole turn, not just the write. See the note above. */
      isSending: mutation.isPending,
      pending,
      /**
       * The last message that failed to send, so its text can be given back to
       * the composer. Distinct `messageId` per attempt, which is what lets the
       * same text be restored again after a second failure.
       */
      failed,
      error: mutation.error as Error | null,
      reset,
    }),
    [sendMessage, mutation.isPending, pending, failed, mutation.error, reset],
  );
}

/** What {@link useSendMessage} hands to the composer. */
export type UseSendMessageResult = ReturnType<typeof useSendMessage>;
