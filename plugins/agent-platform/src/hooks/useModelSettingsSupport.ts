import { useQuery } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import { takesModelSettings } from '../lib/modelSettings';
import { musterToolSchemaQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

const SCHEMA_STALE_MS = 5 * 60_000;

/**
 * Whether the installation's `set_organization_model` takes the model
 * settings (the token limit and prompt caching), from the tool's schema:
 * the forms show those fields only then, and an older agent-manager gets
 * none of them. `undefined` while the schema is read; `false` when it cannot
 * be read. The save checks the schema again (`useEnsureModelOperations`),
 * which shares this read.
 */
export function useModelSettingsSupport(
  installation: string | undefined,
): boolean | undefined {
  const musterApi = useMusterPluginApi();
  const tool = agentManagerToolName(AGENT_MANAGER_TOOLS.setOrganizationModel);
  const { data, isError } = useQuery({
    queryKey: musterToolSchemaQueryKey(installation ?? '', tool),
    enabled: Boolean(musterApi && installation),
    queryFn: () => musterApi!.describeTool(tool, installation),
    select: detail => takesModelSettings(detail.inputSchema),
    staleTime: SCHEMA_STALE_MS,
    retry: false,
  });
  if (!musterApi || !installation || isError) return false;
  return data;
}
