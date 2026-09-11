import { useCallback, useMemo, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import type { AgentRow } from '../components/AgentsDataProvider';
import { sessionsQueryKey } from '../lib/queryKeys';
import { deriveSessionTitle } from '../lib/sessionTitle';

/** What the composer submits: an agent, and the prompt to open the session with. */
export type NewSession = {
  agent: AgentRow;
  prompt: string;
};

/**
 * One submission of the composer, with the idempotency key it was given.
 *
 * The key is minted **once per submission**, outside the mutation, so every
 * retry of that submission — the mutation's own, or the user pressing Start
 * again on the same prompt after a lost answer — carries the same one and the
 * controller answers the same instance instead of creating a second.
 */
type NewSessionRequest = NewSession & { requestId: string };

/**
 * Start a session with an agent: create its AgentInstance.
 *
 * **Creating the instance says nothing to the agent.** The prompt has to be
 * sent separately, as an A2A turn on the new instance. This hook does only the
 * create — the send happens on the session detail page, which the caller
 * navigates to with the prompt in hand. See "Starting a session" in
 * docs/agent-platform.md for why it is split that way rather than done here.
 *
 * The installation is not a parameter: an agent's identity *is*
 * installation/namespace/name, so picking the agent picks the installation, and
 * taking both would let them disagree.
 *
 * The title is derived here rather than by the caller so both entry points — the
 * sessions list and the agent detail page — produce the same one.
 */
export function useCreateSession() {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ agent, prompt, requestId }: NewSessionRequest) => {
      const { sessionId } = await kagentApi.createSession(
        agent.installation,
        // The agent's *technical* name, which names its AgentTemplate. `name` is
        // the display annotation and would not match anything.
        { namespace: agent.namespace, name: agent.technicalName },
        deriveSessionTitle(prompt),
        requestId,
      );

      // Not awaited with a refetch, unlike the rename: the caller navigates away
      // from the list immediately, so forcing it to re-read now would spend a
      // fleet-wide query on a screen nobody is looking at. Marking it stale is
      // enough — coming back to the list refetches it.
      queryClient.invalidateQueries({
        queryKey: sessionsQueryKey(agent.installation),
        refetchType: 'none',
      });

      return { sessionId };
    },
  });

  const { mutateAsync, reset } = mutation;

  // The key of the submission in flight, or of the last one that failed.
  // Kept so that starting the *same* prompt with the same agent again — the
  // natural retry after a network failure — reuses it, while a different prompt
  // or agent is a new submission with a new key.
  const lastRequest = useRef<NewSessionRequest | undefined>(undefined);

  const createSession = useCallback(
    async (newSession: NewSession) => {
      const previous = lastRequest.current;
      const request: NewSessionRequest =
        previous &&
        previous.agent.id === newSession.agent.id &&
        previous.prompt === newSession.prompt
          ? { ...newSession, requestId: previous.requestId }
          : { ...newSession, requestId: crypto.randomUUID() };
      lastRequest.current = request;
      const { sessionId } = await mutateAsync(request);
      // Created: the next identical prompt is a new conversation, not a retry.
      lastRequest.current = undefined;
      return sessionId;
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      createSession,
      isCreating: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [createSession, mutation.isPending, mutation.error, reset],
  );
}

export type UseCreateSessionResult = ReturnType<typeof useCreateSession>;
