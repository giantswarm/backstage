import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { mutedInstallationsApiRef } from './types';

function sameContents(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  // Both come from getSnapshot(), which returns a sorted array, so an
  // index-by-index compare is a full equality check.
  return a.every((value, index) => value === b[index]);
}

/**
 * Subscribe to the muted-installations set as a **stable** array reference.
 *
 * `muted$()` replays `getSnapshot()` on subscribe, and `getSnapshot()` returns a
 * fresh array on every call — so naively storing each emission in state churns
 * the reference even when the contents are unchanged. Consumers that depend on
 * the array in a `useEffect` (notably `ClusterAccessConnector`, whose probe
 * effects would otherwise tear down and re-run — restarting the whole fleet
 * probe on mount) need a reference that only changes when the contents change.
 * Returning the previous array when contents are equal gives them that.
 */
export function useMutedInstallations(): string[] {
  const api = useApi(mutedInstallationsApiRef);
  const [muted, setMuted] = useState<string[]>(() => api.getSnapshot());

  useEffect(() => {
    const subscription = api
      .muted$()
      .subscribe(next =>
        setMuted(prev => (sameContents(prev, next) ? prev : next)),
      );
    return () => subscription.unsubscribe();
  }, [api]);

  return muted;
}
