import { useQuery } from '@tanstack/react-query';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  type AgentManagerAgent,
} from '../lib/agentManager';
import { musterAgentManagerAgentQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';

/**
 * Why the agent could not be read through agent-manager: `refused` carries
 * agent-manager's own answer (a `not_found` for an agent that is gone, the
 * apiserver's Forbidden), `not-connected` means the person's muster session
 * has to be connected to agent-manager first, `error` is everything else.
 */
export type AgentManagerReadFailure = {
  kind: 'refused' | 'not-connected' | 'error';
  code?: AgentManagerError['code'];
  message: string;
};

export function classifyReadFailure(error: unknown): AgentManagerReadFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AgentManagerNotConnectedError) {
    return { kind: 'not-connected', message };
  }
  if (error instanceof AgentManagerError) {
    return { kind: 'refused', code: error.code, message };
  }
  return { kind: 'error', message };
}

export type AgentManagerAgentState = {
  agent: AgentManagerAgent | undefined;
  isLoading: boolean;
  failure?: AgentManagerReadFailure;
};

/**
 * `get_agent`: the agent as agent-manager reads it — the values the edit form
 * is pre-filled from, the skills with their pins, the declared toolset and how
 * the agent is managed. Read as the signed-in person; never persisted.
 */
export function useAgentManagerAgent(
  installation: string | undefined,
  namespace: string,
  name: string,
  options: { enabled?: boolean } = {},
): AgentManagerAgentState {
  const client = useAgentManagerClient(installation);
  const enabled =
    (options.enabled ?? true) &&
    Boolean(client) &&
    Boolean(namespace) &&
    Boolean(name);

  const { data, isLoading, error } = useQuery({
    queryKey: musterAgentManagerAgentQueryKey(
      installation ?? '',
      namespace,
      name,
    ),
    enabled,
    queryFn: () => client!.getAgent(namespace, name),
    // A refused read stays refused; the mutations invalidate this on success.
    retry: false,
    staleTime: 15_000,
  });

  return {
    agent: data,
    isLoading: enabled && isLoading,
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
