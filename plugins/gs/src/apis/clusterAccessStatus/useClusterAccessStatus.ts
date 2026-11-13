import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { ClusterAccessStatusEntry, clusterAccessStatusApiRef } from './types';

/**
 * The latest access state of every probed installation, sorted by name:
 * seeded from the store's snapshot, then following its changes.
 */
export function useClusterAccessStatus(): ClusterAccessStatusEntry[] {
  const statusApi = useApi(clusterAccessStatusApiRef);
  const [entries, setEntries] = useState<ClusterAccessStatusEntry[]>(() =>
    statusApi.getSnapshot(),
  );

  useEffect(() => {
    const subscription = statusApi.status$().subscribe(setEntries);
    return () => subscription.unsubscribe();
  }, [statusApi]);

  return entries;
}
