import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  AgentManagerNotConnectedError,
  type CommitAgentResult,
  type DeleteAgentResult,
} from '../lib/agentManager';
import { useAgentManagerClient } from './useAgentManager';
import { classifyCreateFailure } from './useCreateAgent';
import type { AgentWriteFailure } from './useUpdateAgent';

export type AgentDeletionState = {
  /**
   * `delete_agent` as the person: agent-manager deletes the HelmRelease that
   * owns the agent (helm-controller uninstalls the template and the agent's
   * RemoteMCPServer with it) and the shared chart source only when nothing
   * else references it. Never `force`: a GitOps-owned or suspended release
   * is refused with agent-manager's reason, which the dialog shows as given.
   */
  deleteAgent: () => Promise<DeleteAgentResult>;
  isDeleting: boolean;
  /**
   * `delete_agent` with `mode: commit` (giantswarm/agent-manager#24): a pull
   * request that removes the agent's files from the owning GitOps repository.
   * Offered only when `get_info` reports the `commit` capability.
   */
  commit: () => Promise<CommitAgentResult>;
  isCommitting: boolean;
  failure: AgentWriteFailure | undefined;
  reset: () => void;
};

/**
 * Deleting one agent through agent-manager over muster, as the signed-in
 * person. Authorization is the apiserver's, reached through agent-manager: a
 * viewer's confirm comes back as the Forbidden the apiserver answered.
 *
 * Call this from the page, not from the header's actions element: the header
 * slot renders outside the plugin's `QueryClientProvider`, so the mutation has
 * no client there. The returned object is memoized as a whole because the page
 * passes it straight into the element it registers as the header's actions.
 */
export function useAgentDeletion(
  installation: string | undefined,
  namespace: string,
  name: string,
): AgentDeletionState {
  const client = useAgentManagerClient(installation);
  const queryClient = useQueryClient();

  const requireClient = useCallback(() => {
    if (!client) {
      throw new AgentManagerNotConnectedError(
        'agent-manager is reached through muster, and the muster plugin is not installed in this portal.',
      );
    }
    return client;
  }, [client]);

  const invalidateReads = useCallback(() => {
    if (!installation) {
      return Promise.resolve();
    }
    // Invalidate rather than edit the cache: the plugin's QueryClient is
    // persisted to localStorage, so a stale pre-deletion template could
    // otherwise be rehydrated on reload. Prefixes of the kubernetes-react keys,
    // so one entry per operation covers every kagent.dev list and instance.
    return Promise.all(
      ['list', 'get'].map(operation =>
        queryClient.invalidateQueries({
          queryKey: ['cluster', installation, operation, 'kagent.dev'],
        }),
      ),
    ).then(() => undefined);
  }, [queryClient, installation]);

  const deletion = useMutation({
    mutationFn: () => requireClient().deleteAgent(namespace, name),
    onSuccess: () => invalidateReads(),
  });
  const commitMutation = useMutation({
    mutationFn: () => requireClient().commitDeleteAgent(namespace, name),
  });

  const { mutateAsync: deleteAgent, reset: resetDeletion } = deletion;
  const { mutateAsync: commit, reset: resetCommit } = commitMutation;
  const error = deletion.error ?? commitMutation.error;

  return useMemo(
    () => ({
      deleteAgent,
      isDeleting: deletion.isPending,
      commit,
      isCommitting: commitMutation.isPending,
      failure: error ? classifyCreateFailure(error) : undefined,
      reset: () => {
        resetDeletion();
        resetCommit();
      },
    }),
    [
      deleteAgent,
      deletion.isPending,
      commit,
      commitMutation.isPending,
      error,
      resetDeletion,
      resetCommit,
    ],
  );
}
