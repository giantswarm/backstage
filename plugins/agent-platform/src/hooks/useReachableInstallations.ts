import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
  useHomeInstallation,
} from '@giantswarm/backstage-plugin-gs';

/** States we treat as worth querying. Only `healthy` — a confirmed apiserver
 * round-trip. `connecting` is deliberately excluded: the cluster-access warm-up
 * seeds every installation as `connecting` on load, so including it would fan
 * every fleet query out to installations that turn out to be unreachable. */
const REACHABLE_STATES = new Set(['healthy']);

export type ReachableInstallations = {
  /**
   * Configured installations the app currently considers reachable: the home
   * installation first, the rest in config order.
   */
  installations: string[];
  /** True while access probes are still settling (reachable set may grow). */
  isProbing: boolean;
};

/**
 * The home installation (the one signed in with the main provider, see gs
 * `useHomeInstallation`) first, the rest in the order given. Exported for tests.
 */
export function homeFirst(
  installations: string[],
  home: string | undefined,
): string[] {
  if (!home || !installations.includes(home)) {
    return installations;
  }
  return [home, ...installations.filter(name => name !== home)];
}

/**
 * Narrows a list of installations to those the app should query: currently
 * `healthy` per the shared cluster-access status (see gs `ClusterAccessConnector`),
 * ordered with the home installation first so the person's own installation is
 * queried, and rendered, before any other.
 *
 * This is the *access* filter only. Which installations run a given platform
 * component is the gs `useInstallationInventory`'s question; the fleet-wide
 * providers ask that (`installationsWith('kagent')` and so on) and use this hook
 * only for components the inventory cannot see (model-manager, configured
 * through the backend).
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
  const { home } = useHomeInstallation();
  const homeName = home?.name;
  const [entries, setEntries] = useState<ClusterAccessStatusEntry[]>(() =>
    statusApi.getSnapshot(),
  );

  useEffect(() => {
    const subscription = statusApi.status$().subscribe(setEntries);
    return () => subscription.unsubscribe();
  }, [statusApi]);

  return useMemo(() => {
    const ordered = homeFirst(allInstallations, homeName);
    if (entries.length === 0) {
      return { installations: ordered, isProbing: true };
    }

    const reachable = new Set(
      entries
        .filter(e => REACHABLE_STATES.has(e.state))
        .map(e => e.installation),
    );

    return {
      installations: ordered.filter(name => reachable.has(name)),
      isProbing: entries.some(e => e.state === 'connecting'),
    };
    // allInstallations is derived fresh each render from config; key on its
    // contents rather than identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, allInstallations.join(','), homeName]);
}
