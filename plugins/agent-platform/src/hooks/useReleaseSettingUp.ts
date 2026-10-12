import {
  HelmRelease,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { TRANSITIONAL_REFETCH_INTERVAL_MS } from '../components/AgentsDataProvider';
import { releaseSettingUpUntil } from '../lib/agentProvisioning';
import { useDeadlinePassed } from './useDeadlinePassed';

/**
 * Whether the agent's HelmRelease is new and still reconciling (see
 * {@link releaseSettingUpUntil}), so agent-manager's `failed` verdict on it is
 * shown as the agent being set up rather than as a failure.
 *
 * agent-manager names the release after the agent, in its namespace, and its
 * status carries neither the release's creation time nor its reason, so the
 * release is read here, while `enabled` (the page has no Agent yet), polled at
 * the fast tier until it is ready. A read that is refused — a viewer without
 * access to HelmReleases — or finds nothing gives no window: closed when in
 * doubt.
 */
export function useReleaseSettingUp(
  installation: string,
  namespace: string,
  name: string,
  { enabled }: { enabled: boolean },
): boolean {
  const { resource: release } = useResource(
    installation,
    HelmRelease,
    { name, namespace, enableDiscovery: false },
    {
      enabled,
      // Until the release is ready. The callback sees the raw JSON.
      refetchInterval: query =>
        (
          query.state.data as
            | { status?: { conditions?: { type: string; status: string }[] } }
            | undefined
        )?.status?.conditions?.some(
          condition =>
            condition.type === 'Ready' && condition.status === 'True',
        )
          ? false
          : TRANSITIONAL_REFETCH_INTERVAL_MS,
    },
  );
  const until = enabled && release ? releaseSettingUpUntil(release) : undefined;
  const isPast = useDeadlinePassed(until);
  return until !== undefined && !isPast;
}
