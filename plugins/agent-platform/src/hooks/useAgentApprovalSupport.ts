import { useQuery } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import { musterToolSchemaQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/** Whether an installation's agent-manager takes approval settings. */
export type AgentApprovalSupport =
  'reading' | 'supported' | 'unsupported' | 'unread';

/**
 * Whether agent-manager takes an agent's tool list with approval settings
 * (tool approval, milestone 2): its `create_agent` declares `tools`.
 * agent-manager announces no capability for it, so the schema tells an
 * agent-manager with tool approval (which also splits its update tools)
 * from an older one, which takes `toolset` and nothing else. `unread` when
 * the schema could not be read: the Tools step then offers no settings.
 */
export function useAgentApprovalSupport(
  installation: string | undefined,
): AgentApprovalSupport {
  const musterApi = useMusterPluginApi();
  const tool = agentManagerToolName(AGENT_MANAGER_TOOLS.createAgent);
  const enabled = Boolean(musterApi && installation);
  const { data, isError } = useQuery({
    queryKey: musterToolSchemaQueryKey(installation ?? '', tool),
    enabled,
    queryFn: () => musterApi!.describeTool(tool, installation),
    select: detail =>
      Object.hasOwn(detail.inputSchema?.properties ?? {}, 'tools'),
    staleTime: 60_000,
    retry: false,
  });
  if (!enabled) return 'unsupported';
  if (isError) return 'unread';
  if (data === undefined) return 'reading';
  return data ? 'supported' : 'unsupported';
}
