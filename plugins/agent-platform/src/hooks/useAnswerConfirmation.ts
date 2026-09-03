import { useCallback, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

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
};

/** An answer submitted locally, before kagent's copy of it has been read back. */
export type PendingAnswer = ConfirmationAnswer & { messageId: string };

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
 * The optimistic/failed contract mirrors `useSendMessage`: `pending` is the answer
 * on its way, dropped by *recognition* once a poll returns it, and `failed` hands
 * it back so the panel can restore what the user chose instead of losing it.
 */
export function useAnswerConfirmation(
  installation: string,
  sessionId: string,
  agent: { namespace: string; name: string } | undefined,
) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [failed, setFailed] = useState<PendingAnswer | null>(null);

  const mutation = useMutation({
    mutationFn: async (answer: PendingAnswer) => {
      if (!agent) {
        throw new Error(
          'Cannot answer: the agent for this session is unknown.',
        );
      }
      await kagentApi.answerConfirmation(
        installation,
        sessionId,
        agent,
        answer,
      );

      // Awaited inside `mutationFn`, as on the send: the stand-in must only be
      // dropped once the real thing is readable.
      await queryClient.invalidateQueries({
        queryKey: sessionTasksQueryKey(installation, sessionId),
      });
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKey(installation, sessionId),
      });
    },
    onSuccess: () => {
      setPending(null);
      setFailed(null);
    },
    onError: (_error, answer) => {
      setPending(null);
      setFailed(answer);
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

  return useMemo(
    () => ({
      answer,
      // Covers the whole turn the answer sets off, exactly as `isSending` does —
      // so it drives a "working" indicator, not the panel's disabled state alone.
      isAnswering: mutation.isPending,
      pending,
      failed,
      error: mutation.error as Error | null,
      reset,
    }),
    [answer, mutation.isPending, pending, failed, mutation.error, reset],
  );
}

export type UseAnswerConfirmationResult = ReturnType<
  typeof useAnswerConfirmation
>;
