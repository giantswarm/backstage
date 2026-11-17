import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import { MODEL_CONFIG_NAMESPACE } from '../lib/modelConfigs';
import {
  ORGANIZATIONS_CAPABILITY,
  organizationContentMode,
  organizationModeUnknown,
  type OrganizationWriteMode,
} from '../lib/organizations';
import { musterOrganizationsQueryKey } from '../lib/queryKeys';
import { agentManagerInfoQuery } from './useAgentManager';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * How a write of the content of the organization in `namespace` goes
 * ({@link organizationContentMode}), asked right before the write. The
 * installation's models' namespace is no organization's: live, nothing read.
 * Otherwise `get_info` comes first: where agent-manager opens no pull
 * requests, or serves no organization tools, the answer is live and nothing
 * more is read. Then the organization comes from `list_organizations`, the
 * read the organization pages share. A namespace the listing does not name is
 * refused, nothing written: a live write there could put live content into an
 * organization applied from git.
 */
export function useOrganizationContentMode(): (
  installation: string,
  namespace: string,
) => Promise<OrganizationWriteMode> {
  const musterApi = useMusterPluginApi();
  const queryClient = useQueryClient();
  return useCallback(
    async (installation: string, namespace: string) => {
      if (namespace === MODEL_CONFIG_NAMESPACE) {
        return 'apply';
      }
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
      const organization = listing.organizations.find(
        listed => listed.namespace === namespace,
      );
      if (!organization) {
        throw new Error(organizationModeUnknown(namespace));
      }
      return organizationContentMode(organization, true);
    },
    [musterApi, queryClient],
  );
}

/**
 * The same answer as {@link useOrganizationContentMode}, read while a page
 * renders: `undefined` until it is known, and `apply` wherever the reads fail
 * (the write asks again and refuses then). Pages use it to offer the changes
 * agent-manager makes by pull request.
 */
export function useOrganizationContentModeOf(
  installation: string | undefined,
  namespace: string | undefined,
): OrganizationWriteMode | undefined {
  const musterApi = useMusterPluginApi();
  const relevant = Boolean(
    musterApi &&
    installation &&
    namespace &&
    namespace !== MODEL_CONFIG_NAMESPACE,
  );
  const info = useQuery({
    ...agentManagerInfoQuery(musterApi, installation ?? ''),
    enabled: relevant,
  });
  const commitMode =
    info.data?.capabilities?.commit === true &&
    info.data?.capabilities?.[ORGANIZATIONS_CAPABILITY] === true;
  const listing = useQuery({
    queryKey: musterOrganizationsQueryKey(installation ?? ''),
    queryFn: () =>
      new AgentManagerClient(musterApi!, installation!).listOrganizations(),
    staleTime: 60_000,
    retry: false,
    enabled: relevant && commitMode,
  });
  if (!relevant) {
    return 'apply';
  }
  if (info.isError || (info.data && !commitMode)) {
    return 'apply';
  }
  if (!info.data) {
    return undefined;
  }
  if (listing.isError) {
    return 'apply';
  }
  if (!listing.data) {
    return undefined;
  }
  return organizationContentMode(
    listing.data.organizations.find(listed => listed.namespace === namespace),
    true,
  );
}
