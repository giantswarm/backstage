import { useQuery } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import { takesConnectors } from '../lib/organizationConnectors';
import { musterToolSchemaQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/** Whether an installation's agent-manager takes an agent's `connectors`. */
export type ConnectorsSupport =
  'reading' | 'supported' | 'unsupported' | 'unread';

/**
 * Whether the write the agent wizard ends with (`create_agent`, or
 * `update_agent` while editing) takes the organization's own connectors,
 * from that tool's schema: agent-manager announces no capability for them.
 * `unread` when the schema could not be read.
 */
export function useConnectorsSupport(
  installation: string | undefined,
  editing: boolean,
): ConnectorsSupport {
  const musterApi = useMusterPluginApi();
  const tool = agentManagerToolName(
    editing ? AGENT_MANAGER_TOOLS.updateAgent : AGENT_MANAGER_TOOLS.createAgent,
  );
  const enabled = Boolean(musterApi && installation);
  const { data, isError } = useQuery({
    queryKey: musterToolSchemaQueryKey(installation ?? '', tool),
    enabled,
    queryFn: () => musterApi!.describeTool(tool, installation),
    select: detail => takesConnectors(detail.inputSchema),
    staleTime: 60_000,
    retry: false,
  });
  if (!enabled) return 'unsupported';
  if (isError) return 'unread';
  if (data === undefined) return 'reading';
  return data ? 'supported' : 'unsupported';
}
