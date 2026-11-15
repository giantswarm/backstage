import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { AGENT_MANAGER_TOOLS, agentManagerToolName } from '../lib/agentManager';
import {
  hasModelOperations,
  MODEL_OPERATIONS_MISSING,
} from '../lib/organizations';
import { musterToolSchemaQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

const SCHEMA_STALE_MS = 5 * 60_000;

/**
 * Refuses a model write on an installation whose agent-manager lacks the model
 * fields the forms send, before anything is written. The tool's schema is read
 * once per installation and kept for a few minutes.
 */
export function useEnsureModelOperations(): (
  installation: string,
) => Promise<void> {
  const musterApi = useMusterPluginApi();
  const queryClient = useQueryClient();
  return useCallback(
    async (installation: string) => {
      if (!musterApi) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      const tool = agentManagerToolName(
        AGENT_MANAGER_TOOLS.setOrganizationModel,
      );
      const detail = await queryClient.fetchQuery({
        queryKey: musterToolSchemaQueryKey(installation, tool),
        queryFn: () => musterApi.describeTool(tool, installation),
        staleTime: SCHEMA_STALE_MS,
      });
      if (!hasModelOperations(detail.inputSchema)) {
        throw new Error(MODEL_OPERATIONS_MISSING);
      }
    },
    [musterApi, queryClient],
  );
}
