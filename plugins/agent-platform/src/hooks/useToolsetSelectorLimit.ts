import { useQuery } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import { useMusterPluginApi } from './useMusterPluginApi';

export function useToolsetSelectorLimit(
  installation: string | undefined,
): number | undefined {
  const musterApi = useMusterPluginApi();
  const { data } = useQuery({
    queryKey: ['muster', 'agent-platform', 'toolset-schema', installation],
    enabled: Boolean(musterApi && installation),
    queryFn: async () => {
      const tool = await musterApi!.describeTool(
        agentManagerToolName(AGENT_MANAGER_TOOLS.createAgent),
        installation,
      );
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
