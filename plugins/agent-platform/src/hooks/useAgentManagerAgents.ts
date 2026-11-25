import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentManagerAgent } from '../lib/agentManager';
import { musterAgentManagerAgentQueryKey } from '../lib/queryKeys';
import { useAgentManagerClients } from './useAgentManager';

/** One agent to read, by its identity. */
export type AgentManagerAgentRef = {
  installation: string;
  namespace: string;
  name: string;
};

/**
 * agent-manager's reading of one agent: `agent` once answered, `settled`
 * once the read is over, answered or failed. A read that cannot be made (no
 * muster plugin) is settled without an agent.
 */
export type AgentManagerAgentReading = {
  agent?: AgentManagerAgent;
  settled: boolean;
};

/**
 * `get_agent` for several agents at once, as `useAgentManagerAgent` reads
 * one, sharing its cache entries: keyed by `<installation>/<namespace>/<name>`.
 */
export function useAgentManagerAgents(
  refs: AgentManagerAgentRef[],
): Map<string, AgentManagerAgentReading> {
  const agentManagerOf = useAgentManagerClients();
  const results = useQueries({
    queries: refs.map(({ installation, namespace, name }) => ({
      queryKey: musterAgentManagerAgentQueryKey(installation, namespace, name),
      queryFn: () => agentManagerOf!(installation).getAgent(namespace, name),
      enabled: Boolean(agentManagerOf),
      retry: false,
      staleTime: 15_000,
    })),
  });
  const signature = results
    .map(
      (result, index) =>
        `${index}:${result.dataUpdatedAt}:${result.errorUpdatedAt}:${result.fetchStatus}`,
    )
    .join('|');
  const refsKey = refs
    .map(ref => `${ref.installation}/${ref.namespace}/${ref.name}`)
    .join('|');
  return useMemo(
    () =>
      new Map(
        refs.map((ref, index) => {
          const result = results[index];
          return [
            `${ref.installation}/${ref.namespace}/${ref.name}`,
            {
              agent: result?.data,
              settled: !agentManagerOf || !result || !isAwaitingData(result),
            },
          ];
        }),
      ),
    // The signatures stand in for refs and results, new arrays each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refsKey, signature, agentManagerOf],
  );
}
