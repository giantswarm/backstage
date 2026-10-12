import {
  HelmRelease,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { TRANSITIONAL_REFETCH_INTERVAL_MS } from '../components/AgentsDataProvider';
import { releaseSettingUpUntil } from '../lib/agentProvisioning';
import { useBeforeDeadline } from './useDeadlinePassed';

export type ReleaseSettingUpState = {
  /** The release is new and still reconciling, within its grace period. */
  isSettingUp: boolean;
  /**
   * The release read has not answered yet, so whether the release is being
   * set up is not known: neither a failure nor a window is shown for it yet.
   */
  isDeciding: boolean;
};

/**
 * Whether the agent's HelmRelease is new and still reconciling (see
 * {@link releaseSettingUpUntil}), so agent-manager's `failed` verdict on it is
 * shown as the agent being set up rather than as a failure.
 *
 * agent-manager names the release after the agent, in its namespace, and its
 * status carries neither the release's creation time nor its reason, so the
 * release is read here while `enabled` (the page has no Agent yet). It is
 * polled at the fast tier only while a window is open or the first answer is
 * outstanding; a refused or failed read (a viewer without access to
 * HelmReleases, no such release) stops it and gives no window, and so does a
 * release that can no longer open one: ready, failed, or past its window.
 */
export function useReleaseSettingUp(
  installation: string,
  namespace: string,
  name: string,
  { enabled }: { enabled: boolean },
): ReleaseSettingUpState {
  const { resource: release, error } = useResource(
    installation,
    HelmRelease,
    { name, namespace, enableDiscovery: false },
    {
      enabled,
      // The callback sees the raw answer react-query just stored.
      refetchInterval: query => {
        if (query.state.error) {
          return false;
        }
        if (!query.state.data) {
          return TRANSITIONAL_REFETCH_INTERVAL_MS;
        }
        const windowUntil = releaseSettingUpUntil(
          new HelmRelease(query.state.data as never, installation),
        );
        return windowUntil !== undefined && Date.now() < windowUntil
          ? TRANSITIONAL_REFETCH_INTERVAL_MS
          : false;
      },
    },
  );
  const until = enabled && release ? releaseSettingUpUntil(release) : undefined;
  const isSettingUp = useBeforeDeadline(until);
  const isDeciding = enabled && !release && !error;

  return { isSettingUp, isDeciding };
}
