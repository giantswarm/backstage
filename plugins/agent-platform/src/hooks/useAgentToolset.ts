import { useMemo } from 'react';
import {
  Agent,
  RemoteMCPServer,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import {
  MUSTER_MCP_SERVER_NAME,
  toolsetOfAgent,
  type DeclaredToolset,
} from '../lib/toolset';

/**
 * The toolset one agent declares, read off the `RemoteMCPServer` its gateway
 * binding names.
 *
 * On kagent API v2 the `X-Muster-Toolset` header lives on the per-agent carrier
 * server, not on the template, so the template alone cannot say what the agent
 * reaches. This reads the agent's namespace through the Backstage kubernetes
 * proxy — a namespaced list, which a non-admin who can read the agent can
 * usually read too — and joins it with the template's bindings. While the
 * servers are still loading the result is `unresolved`, never a premature
 * "implicit full access".
 */
export function useAgentToolset(agent: Agent): DeclaredToolset {
  const installation = agent.cluster;
  const namespace = agent.getNamespace();
  const { resources, isLoading } = useResources(
    installation,
    RemoteMCPServer,
    { [installation]: { namespace } },
    { enableDiscovery: false },
  );

  return useMemo(
    () =>
      toolsetOfAgent(
        agent,
        MUSTER_MCP_SERVER_NAME,
        isLoading && resources.length === 0 ? undefined : resources,
      ),
    [agent, isLoading, resources],
  );
}
