import { useMemo } from 'react';
import {
  Agent,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { type AgentRow, toAgentRow } from '../AgentsDataProvider';
import { agentsUsingModel, modelConfigIdOf } from './modelUsage';

export type ModelAgents = {
  /** The agents whose spec names the ModelConfig, by name. */
  agents: AgentRow[];
  isLoading: boolean;
  /** The agents could not be read (and none are known). */
  isUnreadable: boolean;
};

/**
 * The agents that run on one ModelConfig, for its page's "Used by": the
 * `Agent`s of the ModelConfig's own namespace on its installation, which is
 * where an agent's `modelConfig` reference resolves. One namespaced list,
 * rather than the fleet-wide agent provider with its Harnesses and toolset
 * carriers, none of which the page shows.
 */
export function useModelAgents(
  installation: string,
  namespace: string,
  name: string,
): ModelAgents {
  const { resources, isLoading, errors } = useResources(
    installation,
    Agent,
    { [installation]: { namespace } },
    // We type against a single version, same reasoning as the agent provider.
    { enableDiscovery: false },
  );
  const agents = useMemo(
    () =>
      agentsUsingModel(
        resources.map(agent => toAgentRow(agent, [])),
        modelConfigIdOf(installation, namespace, name),
      ),
    [resources, installation, namespace, name],
  );
  return {
    agents,
    isLoading,
    isUnreadable: errors.length > 0 && resources.length === 0,
  };
}
