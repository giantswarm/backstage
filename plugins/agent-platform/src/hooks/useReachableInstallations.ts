import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '@giantswarm/backstage-plugin-gs';

/** States we treat as worth querying. `connecting` means a probe is still in
 * flight, so include it optimistically rather than hide the installation. */
const REACHABLE_STATES = new Set(['healthy', 'connecting']);

export type ReachableInstallations = {
  /** Configured installations the app currently considers reachable. */
  installations: string[];
  /** True while access probes are still settling (reachable set may grow). */
  isProbing: boolean;
};

/**
 * Narrows a list of installations to those the app currently considers
 * reachable, using the shared cluster-access status that the sidebar warm-up
 * maintains app-wide (see gs `ClusterAccessConnector`).
 *
 * Without this, the fleet-wide ModelConfig query fans out to every configured
 * installation — including unreachable/forbidden ones, each of which hangs for
 * the full proxy timeout and retries before settling, dominating the tail and
 * keeping the whole query "loading". Reachable installations
 * (`healthy`/`connecting`) are kept; `degraded` and `session-expired` are
 * skipped, as are installations absent from the status set (non-broker
 * installations the user is signed out of, or not yet probed).
 *
 * Fallback: until the status set has any entry at all (the warm-up seeds
 * `connecting` synchronously on app mount, but a race at first mount is
 * possible), treat every configured installation as reachable rather than
 * hiding all of them — the per-request timeout/retry still bounds the cost.
 */
export function useReachableInstallations(
  allInstallations: string[],
): ReachableInstallations {
  const statusApi = useApi(clusterAccessStatusApiRef);
  const [entries, setEntries] = useState<ClusterAccessStatusEntry[]>(() =>
    statusApi.getSnapshot(),
  );

  useEffect(() => {
    const subscription = statusApi.status$().subscribe(setEntries);
    return () => subscription.unsubscribe();
  }, [statusApi]);

  return useMemo(() => {
    if (entries.length === 0) {
      return { installations: allInstallations, isProbing: true };
    }

    const reachable = new Set(
      entries
        .filter(e => REACHABLE_STATES.has(e.state))
        .map(e => e.installation),
    );

    return {
      installations: allInstallations.filter(name => reachable.has(name)),
      isProbing: entries.some(e => e.state === 'connecting'),
    };
    // allInstallations is derived fresh each render from config; key on its
    // contents rather than identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, allInstallations.join(',')]);
}
