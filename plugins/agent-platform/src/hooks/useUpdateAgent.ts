import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  agentGenerationOf,
  type AgentManagerAgent,
  type AgentApprovalChange,
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

/**
 * What `update_agent` returned, plus the Agent's generation as it stood
 * immediately *before* the write.
 *
 * The detail page's progress needs that baseline to tell this write's verdict
 * from the one that was already there: agent-manager writes the HelmRelease and
 * returns, and helm-controller re-renders the Agent seconds later, so
 * the first status read after saving an agent that was already `ready` answers
 * `ready` for the revision before the write. Nothing in agent-manager's own
 * response carries it — it writes the release, not the Agent, so it cannot
 * know the generation the Agent will land on — which is why it is read here
 * rather than taken from the result.
 */
export type AgentUpdateOutcome = Partial<UpdateAgentResult> & {
  fromGeneration?: number;
};

/**
 * An edit: the update, and the approval settings `set_agent_approval`
 * writes after it (tool approval; the only write of an `Allow` over a
 * connector's `Ask`).
 */
export type AgentSave = AgentUpdate & { approval?: AgentApprovalChange };

/** Whether an update carries a field beyond the agent's identity. */
function carriesFields(update: AgentUpdate): boolean {
  return Object.keys(update).some(key => key !== 'namespace' && key !== 'name');
}

/**
 * The precondition of the approval write: the generation the update before
 * it wrote, else the one the edit was composed from.
 */
function withGeneration(
  approval: AgentApprovalChange,
  update: AgentUpdate,
  result: { agent?: Pick<AgentManagerAgent, 'generation'> } | undefined,
): AgentApprovalChange {
  if (update.expectedGeneration === undefined) {
    return approval;
  }
  const generation = result
    ? agentGenerationOf(result.agent)
    : update.expectedGeneration;
  return generation === undefined
    ? approval
    : { ...approval, expectedGeneration: generation };
}

/** The approval settings a change names, in a sentence. */
function approvalChangeLine(approval: AgentApprovalChange): string {
  const parts = Object.entries(approval.settings ?? {}).map(
    ([selector, setting]) =>
      `${selector.replace(/^[a-z]+:/, '')} ${setting || 'without a setting'}`,
  );
  if (approval.default !== undefined) {
    parts.push(`default ${approval.default || 'removed'}`);
  }
  return parts.join(', ');
}

/**
 * A refusal of `set_agent_approval` after the rest of the edit landed:
 * says what was saved and which settings were not, in agent-manager's code.
 */
function approvalAfterSaveError(
  error: unknown,
  approval: AgentApprovalChange,
): Error {
  if (error instanceof AgentManagerError) {
    return new AgentManagerError(
      error.code,
      `Saved: every other change, the tool list included. Not saved (set_agent_approval refused it): ${approvalChangeLine(
        approval,
      )}. ${error.message} Reload the agent before trying again.`,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

export type UpdateAgentState = {
  /**
   * `update_agent` as the person: merges `update` into the release's values,
   * validates against the chart schema and writes. With `refreshSkills`, every
   * git skill is re-pinned to its default-branch head and nothing else moves.
   */
  update: (update: AgentSave) => Promise<AgentUpdateOutcome>;
  isUpdating: boolean;
  /**
   * `update_agent` with `mode: commit` (giantswarm/agent-manager#24): a pull
   * request instead of a live write. Offered only under the capability gate.
   */
  commit: (update: AgentSave) => Promise<CommitAgentResult>;
  isCommitting: boolean;
  failure: AgentWriteFailure | undefined;
  reset: () => void;
};

/** What kind of change an update is, for its event: never what changed. */
function changeOf(update: AgentUpdate): 'edited' | 'skillsRefreshed' {
  return update.refreshSkills ? 'skillsRefreshed' : 'edited';
}

/**
 * The write behind Save changes and Update skills, through agent-manager over
 * muster as the signed-in person, reported as `AgentPlatform.agentUpdated`
 * (live or as a pull request, an edit or a skills refresh). On success the
 * installation's cached kagent reads are dropped and agent-manager's reading
 * of the agent is read again, so the detail page shows the new revision
 * converging rather than the old values, and the next edit starts from them.
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
        // Every api.kagent.dev read on this installation, keyed the way the
        // kubernetes-react hooks key them: the Agent's spec changes.
        queryClient.invalidateQueries({
          queryKey: ['cluster', installation, 'list', 'api.kagent.dev'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['cluster', installation, 'get', 'api.kagent.dev'],
        }),
        // agent-manager's reading of the agent is read again now, inactive or
        // not: it is what the edit wizard seeds from, and an invalidated but
        // unwatched reading would otherwise be served — the pre-save values —
        // to the next reader until its own refetch landed (live round 2, R2).
        queryClient.invalidateQueries({
          queryKey: musterAgentManagerAgentQueryKey(
            installation,
            update.namespace,
            update.name,
          ),
          refetchType: 'all',
        }),
      ]).then(() => undefined);
    },
    [queryClient, installation],
  );

  const mutation = useTrackedMutation({
    event: (_result, update) => ({
      name: 'AgentPlatform.agentUpdated',
      attributes: { mode: 'apply', change: changeOf(update) },
    }),
    mutationFn: async ({
      approval,
      ...update
    }: AgentSave): Promise<AgentUpdateOutcome> => {
      const agentManager = requireClient();
      // Strictly before the write, so a generation past it can only be one the
      // write caused. Best effort: an installation that cannot answer this
      // still gets its write, and the progress then behaves as it did before —
      // the verdict on its own.
      let fromGeneration: number | undefined;
      try {
        const before = await agentManager.getAgentStatus(
          update.namespace,
          update.name,
        );
        fromGeneration = before.agent?.generation;
      } catch {
        fromGeneration = undefined;
      }
      const result = carriesFields(update)
        ? await agentManager.updateAgent(update)
        : undefined;
      if (approval) {
        try {
          const set = await agentManager.setAgentApproval(
            update.namespace,
            update.name,
            withGeneration(approval, update, result),
          );
          return {
            ...result,
            dropped: [...(result?.dropped ?? []), ...(set.dropped ?? [])],
            warnings: [...(result?.warnings ?? []), ...(set.warnings ?? [])],
            ...((result?.sessionsUpdated === false ||
              set.sessionsUpdated === false) && { sessionsUpdated: false }),
            fromGeneration,
          };
        } catch (error) {
          throw result ? approvalAfterSaveError(error, approval) : error;
        }
      }
      return { ...result, fromGeneration };
    },
    onSuccess: (_result, update) => invalidateReads(update),
    // A refusal after a write landed leaves the agent changed: read it again,
    // so the next look at it is not the one from before the save.
    onError: (_error, update) => invalidateReads(update),
  });
  const commitMutation = useTrackedMutation({
    event: (_result, update) => ({
      name: 'AgentPlatform.agentUpdated',
      attributes: { mode: 'commit', change: changeOf(update) },
    }),
    mutationFn: async ({
      approval,
      ...update
    }: AgentSave): Promise<CommitAgentResult> => {
      const agentManager = requireClient();
      const result = carriesFields(update)
        ? await agentManager.commitUpdateAgent(update)
        : undefined;
      if (!approval) {
        return result ?? {};
      }
      let set: CommitAgentResult;
      try {
        set = await agentManager.setAgentApproval(
          update.namespace,
          update.name,
          // A pull request moves no generation until merged.
          withGeneration(approval, update, undefined),
          'commit',
        );
      } catch (error) {
        throw result ? approvalAfterSaveError(error, approval) : error;
      }
      return result
        ? {
            ...set,
            earlier: [
              ...(result.earlier ?? []),
              { ...result, earlier: undefined },
            ],
          }
        : set;
    },
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
