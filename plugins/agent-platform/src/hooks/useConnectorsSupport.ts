import { useQuery } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import { takesConnectors } from '../lib/organizationConnectors';
import { musterToolSchemaQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/** Whether an installation's agent-manager takes an agent's `connectors`. */
export type ConnectorsSupport =
  'reading' | 'supported' | 'unsupported' | 'unread';

/**
 * Whether agent-manager takes the organization's own connectors, from
 * `create_agent`'s schema: agent-manager announces no capability for them.
 * The edit writes them with the same release (`update_agent` before tool
 * approval, `update_agent_access` since, which `update_agent` no longer
 * covers), so `create_agent` answers for both. `unread` when the schema
 * could not be read.
 */
export function useConnectorsSupport(
  installation: string | undefined,
  editing: boolean,
): ConnectorsSupport {
  const musterApi = useMusterPluginApi();
  // Kept in the signature: the callers say whether they edit.
  void editing;
  const tool = agentManagerToolName(AGENT_MANAGER_TOOLS.createAgent);
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
