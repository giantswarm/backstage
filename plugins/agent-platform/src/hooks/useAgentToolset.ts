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

export type AgentToolset = {
  declared: DeclaredToolset;
  /** The carrier read has not answered yet — nothing can be said about the toolset. */
  isReading: boolean;
  /** The read answered with a failure (no permission, no such kind, unreachable). */
  isUnreadable: boolean;
};

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
 * "implicit full access"; `isReading` is what tells the two apart, so a caller
 * can wait rather than claim the carrier is unreadable.
 *
 * Settledness comes from the query's own answer (items or an error), not from
 * `isLoading`: an enabled query reports `fetchStatus: 'idle'` on the render
 * before it starts fetching, so `isLoading` is false with nothing read yet —
 * the same trap `usePreferredVersions` documents. Reading it this way also
 * keeps a background refetch from flipping a settled card back to reading.
 */
export function useAgentToolset(agent: Agent): AgentToolset {
  const installation = agent.cluster;
  const namespace = agent.getNamespace();
  const { resources, errors, clustersData } = useResources(
    installation,
    RemoteMCPServer,
    { [installation]: { namespace } },
    { enableDiscovery: false },
  );

  // No installation means no query at all, which would never settle; there is
  // nothing to wait for either.
  const settled = !installation || clustersData.length > 0 || errors.length > 0;

  return useMemo(
    () => ({
      declared: toolsetOfAgent(
        agent,
        MUSTER_MCP_SERVER_NAME,
        settled ? resources : undefined,
      ),
      isReading: !settled,
      isUnreadable: settled && errors.length > 0,
    }),
    [agent, settled, resources, errors],
  );
}
