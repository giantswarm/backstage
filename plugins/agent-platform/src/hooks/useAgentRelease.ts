import {
  HelmRelease,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { TRANSITIONAL_REFETCH_INTERVAL_MS } from '../components/AgentsDataProvider';
import { settingUpUntil } from '../lib/agentProvisioning';
import type { ServerNow } from './useServerClock';

export type AgentReleaseState = {
  /**
   * The agent's HelmRelease, as read since this page mounted; `undefined`
   * before that read has answered, or when it failed (a viewer without access
   * to HelmReleases, no such release).
   */
  release: HelmRelease | undefined;
  /** The read has not answered yet, so nothing is known about the release. */
  isDeciding: boolean;
};

/**
 * The agent's HelmRelease, for {@link settingUpUntil}: agent-manager names it
 * after the agent, in its namespace, and its own status carries neither the
 * release's creation time nor its reason.
 *
 * Only an answer fetched since mount counts. The query cache (persisted
 * across reloads) can hold the release of an agent deleted and created again
 * under the same name a minute ago, and that one's `InstallFailed` would
 * decide for the new release. So the read always refetches on mount, and is
 * `isDeciding` until it has.
 *
 * Polled at the fast tier only while it is deciding or the release is still
 * settling inside its window; an error, or a release that can no longer open
 * a window (ready, failed, past it), stops it.
 */
export function useAgentRelease(
  installation: string,
  namespace: string,
  name: string,
  now: ServerNow,
): AgentReleaseState {
  const { resource, error, isFetchedAfterMount } = useResource(
    installation,
    HelmRelease,
    { name, namespace, enableDiscovery: false },
    {
      // Stale at once, so a mount refetches whatever the cache holds.
      staleTime: 0,
      // The callback sees the raw answer react-query just stored.
      refetchInterval: query => {
        if (query.state.error) {
          return false;
        }
        if (!query.state.data) {
          return TRANSITIONAL_REFETCH_INTERVAL_MS;
        }
        const until = settingUpUntil({
          release: new HelmRelease(query.state.data as never, installation),
        });
        return until !== undefined && now() < until
          ? TRANSITIONAL_REFETCH_INTERVAL_MS
          : false;
      },
    },
  );
  const isAnswered = isFetchedAfterMount || Boolean(error);
  return {
    release: isFetchedAfterMount && !error ? resource : undefined,
    isDeciding: Boolean(name) && !isAnswered,
  };
}
