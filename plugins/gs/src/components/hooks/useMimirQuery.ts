import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MimirQueryResponse } from '../../apis/mimir/types';
import { useMimirAvailable } from './useMimirAvailable';
import { useMimirQueryFn } from './useMimirQueryFn';

export function useMimirQuery(options: {
  installationName: string;
  query: string;
  enabled?: boolean;
  refetchInterval?: number | false;
  /**
   * Keep the previous answer on screen while a **new query key** fetches,
   * instead of reporting `isLoading` again.
   *
   * For a caller whose query string moves on its own — a window that snaps to
   * a clock boundary, say. Without it the key change reads as a first load, so
   * a page gated on `isLoading` replaces itself with a spinner every time the
   * boundary passes, losing scroll position and table sort for a round trip.
   */
  keepPreviousAnswer?: boolean;
}) {
  const {
    installationName,
    query,
    enabled = true,
    refetchInterval,
    keepPreviousAnswer = false,
  } = options;

  const queryMimir = useMimirQueryFn();

  // Installations without Mimir (`mimirEnabled: false`) never get queried:
  // the query would only ever fail, and "metrics unavailable" is the truth
  // callers should render. `undefined` means the installations config is
  // still loading — the query stays disabled and `isLoading` stays true.
  const isAvailable = useMimirAvailable(installationName);

  const wanted = Boolean(enabled && installationName && query);

  const { data, isLoading, error } = useQuery<MimirQueryResponse, Error>({
    queryKey: ['mimir-query', installationName, query],
    queryFn: () => queryMimir(installationName, query),
    enabled: wanted && isAvailable === true,
    staleTime: 30_000,
    refetchInterval,
    placeholderData: keepPreviousAnswer ? keepPreviousData : undefined,
  });

  return useMemo(
    () => ({
      data,
      // While the installations config is loading, availability is unknown and
      // the query is disabled — report loading so callers don't flash an empty
      // state that then resolves either way.
      isLoading: isLoading || (wanted && isAvailable === undefined),
      error: error as Error | null,
      isAvailable,
    }),
    [data, isLoading, error, wanted, isAvailable],
  );
}
