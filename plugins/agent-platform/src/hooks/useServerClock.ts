import { useCallback } from 'react';
import { useApiHolder } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { kagentApiRef } from '../apis';

/** How long one reading of the server's clock is trusted for. */
const SERVER_CLOCK_STALE_MS = 10 * 60_000;

/** The current time on the server's clock, as epoch milliseconds. */
export type ServerNow = () => number;

/**
 * The server's clock: the browser's, corrected by how far it is off the
 * backend's, read once (and every ten minutes) from the backend.
 *
 * What the browser compares with a cluster's timestamps — an agent's
 * `creationTimestamp`, to tell how new it is — has to be server time: a laptop
 * clock minutes behind would stretch a three-minute window by as much, and one
 * ahead would erase it. Until the first reading, or without one (no backend,
 * a stand-in API without `getServerTime`), the browser's clock stands in.
 */
export function useServerClock(): ServerNow {
  const kagentApi = useApiHolder().get(kagentApiRef);
  const { data: offset = 0 } = useQuery({
    queryKey: ['agent-platform', 'server-clock'],
    enabled: Boolean(kagentApi?.getServerTime),
    queryFn: async () => {
      const sentAt = Date.now();
      const serverTime = await kagentApi!.getServerTime!();
      const receivedAt = Date.now();
      // The server read its clock somewhere in the round trip; the middle is
      // the best guess, off by at most half of it.
      return serverTime - (sentAt + receivedAt) / 2;
    },
    staleTime: SERVER_CLOCK_STALE_MS,
    retry: false,
  });
  return useCallback(() => Date.now() + offset, [offset]);
}
