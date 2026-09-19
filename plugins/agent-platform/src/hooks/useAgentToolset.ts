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
 * Settledness comes from the queries' own terminal state, and from neither
 * `isLoading` nor `errors`. Not `isLoading`, because an enabled query reports
 * `fetchStatus: 'idle'` on the render before it starts fetching, so it is
 * false with nothing read yet — the trap `usePreferredVersions` documents. Not
 * `errors`, because `useResources` filters a `RejectedError` (an installation
 * the person has not authenticated with) out of it: that read is over, but it
 * leaves neither items nor a reported error, and waiting on those would leave
 * the caller waiting forever. Reading the queries also keeps a background
 * refetch from flipping a settled card back to reading.
 */
export function useAgentToolset(agent: Agent): AgentToolset {
  const installation = agent.cluster;
  const namespace = agent.getNamespace();
  const { resources, queries } = useResources(
    installation,
    RemoteMCPServer,
    { [installation]: { namespace } },
    { enableDiscovery: false },
  );

  // Paused counts as done: offline, the query sits pending with nothing on the
  // way, and the read has failed as far as this page is concerned.
  const settled = queries.every(
    ({ query }) => query.isSuccess || query.isError || query.isPaused,
  );
  const failed = queries.some(({ query }) => query.isError || query.isPaused);

  // Booleans, not the arrays they come from: `errors` is a new array on every
  // render (its own memo depends on the cluster list `useResources` rebuilds
  // each time), and depending on it would give every render a new result —
  // which the card's memos, keyed on this one, all hang off.
  return useMemo(
    () => ({
      declared: toolsetOfAgent(
        agent,
        MUSTER_MCP_SERVER_NAME,
        settled ? resources : undefined,
      ),
      isReading: !settled,
      isUnreadable: settled && failed,
    }),
    [agent, settled, failed, resources],
  );
}
