import { queryOptions } from '@tanstack/react-query';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import { musterOrganizationsQueryKey } from '../lib/queryKeys';
import type { useMusterPluginApi } from './useMusterPluginApi';

/** How long a `list_organizations` answer stays fresh: a minute. */
export const ORGANIZATIONS_STALE_TIME = 60_000;

/**
 * `list_organizations` of one installation as a query, the entry the
 * organization pages read: a minute of staleness is fine. A module of its
 * own, apart from `useAgentManager`, which many tests replace whole.
 */
export function organizationsQuery(
  musterApi: ReturnType<typeof useMusterPluginApi>,
  installation: string,
) {
  return queryOptions({
    queryKey: musterOrganizationsQueryKey(installation),
    queryFn: () =>
      new AgentManagerClient(musterApi!, installation).listOrganizations(),
    staleTime: ORGANIZATIONS_STALE_TIME,
    retry: false,
  });
}
