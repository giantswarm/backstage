import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  type AgentSpec,
  type CommitAgentResult,
  type CreateAgentResult,
} from '../lib/agentManager';
import { useAgentManagerClient } from './useAgentManager';

/**
 * Why a write did not land, for the review page to say in agent-manager's own
 * words: `refused` carries the apiserver's Forbidden for a viewer, a `conflict`
 * for an existing name or a GitOps-owned namespace, a schema violation;
 * `not-connected` means the person's muster session has to be connected to
 * agent-manager first; `error` is everything else.
 */
export type CreateAgentFailure = {
  kind: 'refused' | 'not-connected' | 'error';
  code?: AgentManagerError['code'];
  message: string;
};

export type CreateAgentState = {
  /** `create_agent` as the person: applies the release live. */
  deploy: (spec: AgentSpec) => Promise<CreateAgentResult>;
  /** `create_agent` with `mode: commit`: a pull request instead. */
  commit: (spec: AgentSpec) => Promise<CommitAgentResult>;
  isDeploying: boolean;
  isCommitting: boolean;
  failure: CreateAgentFailure | undefined;
  reset: () => void;
};

export function classifyCreateFailure(error: unknown): CreateAgentFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AgentManagerNotConnectedError) {
    return { kind: 'not-connected', message };
  }
  if (error instanceof AgentManagerError) {
    return { kind: 'refused', code: error.code, message };
  }
  return { kind: 'error', message };
}

/**
 * The create flow's write, through agent-manager over muster as the signed-in
 * person. agent-manager composes the release, validates it against the chart
 * schema and applies it with the person's own credentials — the HelmRelease's
 * `managedFields` name the person. On success the installation's cached kagent
 * reads are dropped so the roster picks the new agent up on its next render.
 */
export function useCreateAgent(
  installation: string | undefined,
): CreateAgentState {
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

  const invalidateKagentReads = useCallback(() => {
    if (!installation) {
      return Promise.resolve();
    }
    // Every kagent.dev list on this installation, keyed the way the
    // kubernetes-react read hooks key them; the roster re-reads on its next
    // render and the detail page reads fresh anyway.
    return queryClient.invalidateQueries({
      queryKey: ['cluster', installation, 'list', 'kagent.dev'],
    });
  }, [queryClient, installation]);

  const deployMutation = useMutation({
    mutationFn: (spec: AgentSpec) => requireClient().createAgent(spec),
    onSuccess: () => invalidateKagentReads(),
  });
  const commitMutation = useMutation({
    mutationFn: (spec: AgentSpec) => requireClient().commitAgent(spec),
  });

  const { mutateAsync: deploy, reset: resetDeploy } = deployMutation;
  const { mutateAsync: commit, reset: resetCommit } = commitMutation;
  const error = deployMutation.error ?? commitMutation.error;

  return useMemo(
    () => ({
      deploy,
      commit,
      isDeploying: deployMutation.isPending,
      isCommitting: commitMutation.isPending,
      failure: error ? classifyCreateFailure(error) : undefined,
      reset: () => {
        resetDeploy();
        resetCommit();
      },
    }),
    [
      deploy,
      commit,
      deployMutation.isPending,
      commitMutation.isPending,
      error,
      resetDeploy,
      resetCommit,
    ],
  );
}
