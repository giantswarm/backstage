import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import {
  ORGANIZATIONS_CAPABILITY,
  organizationContentMode,
  type OrganizationWriteMode,
} from '../lib/organizations';
import { musterOrganizationsQueryKey } from '../lib/queryKeys';
import { agentManagerInfoQuery } from './useAgentManager';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * How a write of the content of the organization in `namespace` goes
 * ({@link organizationContentMode}), asked right before the write. The
 * installation's `get_info` comes first: where agent-manager opens no pull
 * requests, or serves no organization tools, the answer is live and nothing
 * more is read. Otherwise the
 * organization comes from `list_organizations`, the read the organization
 * pages share. A namespace that is no organization's (the installation's
 * models) is written live.
 */
export function useOrganizationContentMode(): (
  installation: string,
  namespace: string,
) => Promise<OrganizationWriteMode> {
  const musterApi = useMusterPluginApi();
  const queryClient = useQueryClient();
  return useCallback(
    async (installation: string, namespace: string) => {
      if (!musterApi) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      const info = await queryClient.fetchQuery(
        agentManagerInfoQuery(musterApi, installation),
      );
      if (
        info.capabilities?.commit !== true ||
        info.capabilities?.[ORGANIZATIONS_CAPABILITY] !== true
      ) {
        return 'apply';
      }
      const listing = await queryClient.fetchQuery({
        queryKey: musterOrganizationsQueryKey(installation),
        queryFn: () =>
          new AgentManagerClient(musterApi, installation).listOrganizations(),
        staleTime: 60_000,
      });
      return organizationContentMode(
        listing.organizations.find(
          organization => organization.namespace === namespace,
        ),
        true,
      );
    },
    [musterApi, queryClient],
  );
}
