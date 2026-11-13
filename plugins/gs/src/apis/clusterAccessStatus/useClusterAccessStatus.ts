import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { ClusterAccessStatusEntry, clusterAccessStatusApiRef } from './types';

function sameEntries(
  a: ClusterAccessStatusEntry[],
  b: ClusterAccessStatusEntry[],
): boolean {
  // Both come from getSnapshot(), sorted by installation.
  return (
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.installation === b[index].installation &&
        entry.state === b[index].state &&
        entry.reason === b[index].reason,
    )
  );
}

/**
 * The latest access state of every probed installation, sorted by name, as a
 * **stable** array: seeded from the store's snapshot, then following its
 * changes, keeping the previous reference while the states are unchanged (the
 * subscription replays a fresh snapshot on subscribe), so a consumer's memo
 * or effect does not re-run for nothing.
 */
export function useClusterAccessStatus(): ClusterAccessStatusEntry[] {
  const statusApi = useApi(clusterAccessStatusApiRef);
  const [entries, setEntries] = useState<ClusterAccessStatusEntry[]>(() =>
    statusApi.getSnapshot(),
  );

  useEffect(() => {
    const subscription = statusApi
      .status$()
      .subscribe(next =>
        setEntries(prev => (sameEntries(prev, next) ? prev : next)),
      );
    return () => subscription.unsubscribe();
  }, [statusApi]);

  return entries;
}
