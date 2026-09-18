import { useEffect, useState } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { platformCapabilitiesApiRef, VerifyResult } from '../apis';
import { verifyKey } from './queries';

/**
 * How many comparisons run at once. Each is one `verify_capability` call
 * that renders the installation and reads its repositories as the person,
 * so a registry of thirty does not open thirty GitHub reads in one go.
 */
export const VERIFY_WINDOW = 4;

/**
 * One `verify_capability` per installation, run when the view opens and on
 * demand (`refetch`). The results are kept for the session: they never go
 * stale and are not collected while the page lives, so leaving the view and
 * coming back shows the last comparison, and only *Verify now* runs another.
 * The comparisons start in the order of the rows, `VERIFY_WINDOW` at a time.
 */
export function useConsistency(
  installations: string[],
  capability: string,
): UseQueryResult<VerifyResult, Error>[] {
  const api = useApi(platformCapabilitiesApiRef);
  const [settled, setSettled] = useState(0);
  const results = useQueries({
    queries: installations.map((installation, index) => ({
      queryKey: verifyKey(installation, capability),
      queryFn: () => api.verifyCapability(installation, capability),
      staleTime: Infinity,
      gcTime: Infinity,
      // A failed comparison is shown as the manager answered it; *Verify
      // now* is the retry, not a second render behind the person's back.
      retry: false,
      enabled: index < settled + VERIFY_WINDOW,
    })),
  });
  const done = results.filter(r => r.isSuccess || r.isError).length;
  useEffect(() => setSettled(done), [done]);
  return results;
}
