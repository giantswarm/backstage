import { useQuery } from '@tanstack/react-query';

import type { AgentManagerModelConfig } from '../lib/agentManager';
import { musterAgentManagerModelConfigsQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';
import {
  classifyReadFailure,
  type AgentManagerReadFailure,
} from './useAgentManagerAgent';

export type AgentManagerModelConfigsState = {
  modelConfigs: AgentManagerModelConfig[];
  isLoading: boolean;
  failure?: AgentManagerReadFailure;
};

/**
 * `list_model_configs`: the ModelConfigs of the agent's namespace — the values
 * `modelConfig` may take in an update. Read through agent-manager rather than
 * the fleet-wide ModelConfigs list, which is admin-only: an author who may edit
 * an agent may not be allowed to list ModelConfigs across every namespace.
 */
export function useAgentManagerModelConfigs(
  installation: string | undefined,
  namespace: string,
): AgentManagerModelConfigsState {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && Boolean(namespace);

  const { data, isLoading, error } = useQuery({
    queryKey: musterAgentManagerModelConfigsQueryKey(
      installation ?? '',
      namespace,
    ),
    enabled,
    queryFn: () => client!.listModelConfigs(namespace),
    retry: false,
    staleTime: 60_000,
  });

  return {
    modelConfigs: data ?? [],
    isLoading: enabled && isLoading,
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
