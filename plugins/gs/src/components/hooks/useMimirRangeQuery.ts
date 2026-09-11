import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { mimirApiRef } from '../../apis/mimir';
import { MimirRangeQueryResponse } from '../../apis/mimir/types';
import { useMimirAvailable } from './useMimirAvailable';

/**
 * A PromQL query evaluated at every `step` across `[start, end]` — a series
 * over time, where {@link useMimirQuery} gives one value.
 *
 * `start`, `end` and `step` are part of the query key, so **they must be
 * stable across renders**: a caller that passes `Date.now()` re-keys on every
 * render and refetches forever. Snap the window to a boundary (a UTC midnight,
 * a whole `step`) and memoise it. The alignment is the caller's, not this
 * hook's, because it decides what a bucket means — a bucket boundary at
 * midnight measures calendar days, one at an arbitrary clock time measures
 * rolling ones.
 */
export function useMimirRangeQuery(options: {
  installationName: string;
  query: string;
  /** Unix seconds. */
  start: string;
  /** Unix seconds. */
  end: string;
  /** A Prometheus duration (`1d`) or a number of seconds. */
  step: string;
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
    start,
    end,
    step,
    enabled = true,
    refetchInterval,
    keepPreviousAnswer = false,
  } = options;

  const mimirApi = useApi(mimirApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);

  // Installations without Mimir (`mimirEnabled: false`) never get queried:
  // the query would only ever fail, and "metrics unavailable" is the truth
  // callers should render. `undefined` means the installations config is
  // still loading — the query stays disabled and `isLoading` stays true.
  const isAvailable = useMimirAvailable(installationName);

  const wanted = Boolean(
    enabled && installationName && query && start && end && step,
  );

  const { data, isLoading, error } = useQuery<MimirRangeQueryResponse, Error>({
    queryKey: ['mimir-range-query', installationName, query, start, end, step],
    queryFn: async () => {
      const cluster = await kubernetesApi.getCluster(installationName);
      if (!cluster) {
        throw new Error(`Cluster ${installationName} not found`);
      }

      const authProvider =
        cluster.authProvider === 'oidc'
          ? `${cluster.authProvider}.${cluster.oidcTokenProvider}`
          : cluster.authProvider;

      const credentials =
        await kubernetesAuthProvidersApi.getCredentials(authProvider);

      if (!credentials.token) {
        throw new Error(
          `No OIDC token available for installation "${installationName}"`,
        );
      }

      return mimirApi.queryRange({
        installationName,
        query,
        start,
        end,
        step,
        oidcToken: credentials.token,
      });
    },
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
