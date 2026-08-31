import { useCallback, useMemo } from 'react';
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
 * Start a session with an agent.
 *
 * **Creating a session says nothing to the agent.** kagent's session is a shell;
 * the prompt has to be sent separately, as an A2A turn whose `contextId` is the
 * new session's id. This hook does only the create — the send happens on the
 * session detail page, which the caller navigates to with the prompt in hand.
 * See "Starting a session" in docs/agent-platform.md for why it is split that
 * way rather than done here.
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
    mutationFn: async ({ agent, prompt }: NewSession) => {
      const { sessionId } = await kagentApi.createSession(
        agent.installation,
        // The agent's *technical* name, which is what kagent resolves
        // `agent_ref` against. `name` is the display annotation and would not
        // match anything.
        { namespace: agent.namespace, name: agent.technicalName },
        deriveSessionTitle(prompt),
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

  const createSession = useCallback(
    async (newSession: NewSession) => {
      const { sessionId } = await mutateAsync(newSession);
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
