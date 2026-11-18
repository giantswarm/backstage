import { useQuery } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import { musterToolSchemaQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * `create_agent`'s cap on the toolset's selectors, from its schema. The
 * query holds the tool's detail, as every read of a tool's schema does
 * (`useConnectorsSupport` shares it), and selects the cap.
 */
export function useToolsetSelectorLimit(
  installation: string | undefined,
): number | undefined {
  const musterApi = useMusterPluginApi();
  const createAgent = agentManagerToolName(AGENT_MANAGER_TOOLS.createAgent);
  const { data } = useQuery({
    queryKey: musterToolSchemaQueryKey(installation ?? '', createAgent),
    enabled: Boolean(musterApi && installation),
    queryFn: () => musterApi!.describeTool(createAgent, installation),
    select: tool => {
      const maximum = tool.inputSchema?.properties?.toolset?.maxItems;
      return typeof maximum === 'number' &&
        Number.isSafeInteger(maximum) &&
        maximum > 0
        ? maximum
        : null;
    },
    staleTime: 60_000,
    retry: false,
  });
  return data ?? undefined;
}
