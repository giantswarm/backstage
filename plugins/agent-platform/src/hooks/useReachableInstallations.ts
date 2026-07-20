import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '@giantswarm/backstage-plugin-gs';

/** States we treat as worth querying. Only `healthy` — a confirmed apiserver
 * round-trip. `connecting` is deliberately excluded: the cluster-access warm-up
 * seeds every installation as `connecting` on load, so including it would fan
 * every fleet query out to installations that turn out to be unreachable. */
const REACHABLE_STATES = new Set(['healthy']);

export type ReachableInstallations = {
  /** Configured installations the app currently considers reachable. */
  installations: string[];
  /** True while access probes are still settling (reachable set may grow). */
  isProbing: boolean;
};

/**
 * Narrows a list of installations to those the app should query: currently
 * `healthy` per the shared cluster-access status (see gs `ClusterAccessConnector`).
 *
 * Only `healthy` installations are kept; `connecting` (probe still in flight),
 * `degraded`, `session-expired`, and installations absent from the status set
 * (non-broker installations the user is signed out of, or not yet probed) are
 * skipped. Relying on the confirmed-healthy set — rather than optimistically
 * including `connecting` — stops fleet queries fanning out to clusters that turn
 * out to be down (each otherwise hangs for the full proxy timeout and retries,
 * dominating the tail) and stops the list churning wide-then-narrow as probes
 * settle. The sidebar Cluster-access widget owns surfacing degraded/unreachable
 * clusters, so these pages don't re-discover it. Installations the user has muted
 * app-wide are also excluded here for free: they are never probed, so they never
 * become `healthy`.
 *
 * Tradeoff: on a cold, direct page load we wait for the first access probe
 * (~one probe) instead of querying optimistically. In practice the probe runs on
 * app start, so healthy installations are usually already confirmed by the time
 * these pages open.
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
