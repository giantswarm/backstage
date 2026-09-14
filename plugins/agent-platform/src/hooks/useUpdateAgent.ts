import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  AgentManagerNotConnectedError,
  type AgentUpdate,
  type CommitAgentResult,
  type UpdateAgentResult,
} from '../lib/agentManager';
import { musterAgentManagerAgentQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';
import {
  classifyCreateFailure,
  type CreateAgentFailure,
} from './useCreateAgent';

/** Why a write did not land, in agent-manager's words — the same three kinds as a create. */
export type AgentWriteFailure = CreateAgentFailure;

export type UpdateAgentState = {
  /**
   * `update_agent` as the person: merges `update` into the release's values,
   * validates against the chart schema and writes. With `refreshSkills`, every
   * git skill is re-pinned to its default-branch head and nothing else moves.
   */
  update: (update: AgentUpdate) => Promise<UpdateAgentResult>;
  isUpdating: boolean;
  /**
   * `update_agent` with `mode: commit` (giantswarm/agent-manager#24): a pull
   * request instead of a live write. Offered only under the capability gate.
   */
  commit: (update: AgentUpdate) => Promise<CommitAgentResult>;
  isCommitting: boolean;
  failure: AgentWriteFailure | undefined;
  reset: () => void;
};

/**
 * The write behind Save and Update skills, through agent-manager over muster
 * as the signed-in person. On success the installation's cached kagent reads
 * and agent-manager's reading of the agent are dropped, so the detail page
 * shows the new revision converging rather than the old values.
 */
export function useUpdateAgent(
  installation: string | undefined,
): UpdateAgentState {
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

  const invalidateReads = useCallback(
    (update: AgentUpdate) => {
      if (!installation) {
        return Promise.resolve();
      }
      return Promise.all([
        // Every kagent.dev read on this installation, keyed the way the
        // kubernetes-react hooks key them: the template's spec changes.
        queryClient.invalidateQueries({
          queryKey: ['cluster', installation, 'list', 'kagent.dev'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['cluster', installation, 'get', 'kagent.dev'],
        }),
        queryClient.invalidateQueries({
          queryKey: musterAgentManagerAgentQueryKey(
            installation,
            update.namespace,
            update.name,
          ),
        }),
      ]).then(() => undefined);
    },
    [queryClient, installation],
  );

  const mutation = useMutation({
    mutationFn: (update: AgentUpdate) => requireClient().updateAgent(update),
    onSuccess: (_result, update) => invalidateReads(update),
  });
  const commitMutation = useMutation({
    mutationFn: (update: AgentUpdate) =>
      requireClient().commitUpdateAgent(update),
  });

  const { mutateAsync: update, reset: resetUpdate } = mutation;
  const { mutateAsync: commit, reset: resetCommit } = commitMutation;
  const error = mutation.error ?? commitMutation.error;

  return useMemo(
    () => ({
      update,
      isUpdating: mutation.isPending,
      commit,
      isCommitting: commitMutation.isPending,
      failure: error ? classifyCreateFailure(error) : undefined,
      reset: () => {
        resetUpdate();
        resetCommit();
      },
    }),
    [
      update,
      mutation.isPending,
      commit,
      commitMutation.isPending,
      error,
      resetUpdate,
      resetCommit,
    ],
  );
}
