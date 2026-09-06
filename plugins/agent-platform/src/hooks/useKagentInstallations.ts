import { useEffect, useMemo, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import {
  isKagentInstallationList,
  KagentInstallation,
} from '../lib/kagentInstallations';
import { kagentInstallationsQueryKey } from '../lib/queryKeys';

/**
 * The backend's kagent installation list changes with config, not with
 * navigation -- except for its reachability, which the backend learns from a
 * probe that may not have settled when the list is first read (see
 * {@link REFETCH_WHILE_UNKNOWN_MS}).
 */
export const KAGENT_INSTALLATIONS_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * While any installation is `'unknown'` the backend's probes are still in
 * flight (a pod that just started); the list is re-read every few seconds
 * until every entry is settled, then left alone for an hour. Without this a
 * list read in that window would pin `'unknown'` for the hour, and every
 * doomed per-user request the probe exists to prevent would stay alive.
 */
export const REFETCH_WHILE_UNKNOWN_MS = 5_000;

export function hasUnknownReachability(
  installations: KagentInstallation[] | undefined,
): boolean {
  return Boolean(
    installations?.some(installation => installation.reachable === 'unknown'),
  );
}

export type KagentInstallations = {
  /**
   * The backend's list, or `undefined` until it has answered (or while a
   * rehydrated entry of a foreign shape is being replaced).
   */
  installations: KagentInstallation[] | undefined;
  isLoading: boolean;
  /** The backend call failed; callers fall back rather than show nothing. */
  isError: boolean;
  /**
   * Names the backend proxies and has **not** reported unreachable
   * (`reachable` is `true` or `'unknown'`): the ones worth a per-user call.
   */
  proxied: string[];
  /** Names the backend reports as not reachable from this portal. */
  notReachable: string[];
  /** Whether the backend reports `installation` as not reachable from this portal. */
  isNotReachable: (installation: string) => boolean;
};

/**
 * Which installations the backend proxies kagent for, and whether each one's
 * kagent endpoint is reachable from this portal.
 *
 * One cheap backend call, cached for an hour and persisted by the plugin's
 * `QueryClientProvider` (installation state, identical for every user). Shared
 * by the sessions provider (which decides whom to query) and the capabilities
 * probe (which must not identity-probe an installation nothing can reach), so
 * the two never disagree about an installation.
 */
export function useKagentInstallations(): KagentInstallations {
  const kagentApi = useApi(kagentApiRef);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: kagentInstallationsQueryKey(),
    queryFn: () => kagentApi.listInstallations(),
    staleTime: query =>
      hasUnknownReachability(query.state.data)
        ? REFETCH_WHILE_UNKNOWN_MS
        : KAGENT_INSTALLATIONS_STALE_TIME_MS,
    refetchInterval: query =>
      hasUnknownReachability(query.state.data)
        ? REFETCH_WHILE_UNKNOWN_MS
        : false,
  });

  // The cache is persisted across releases, so guard the rehydrated shape: a
  // foreign entry under this key reads as "not answered yet" and is fetched
  // once. (The key carries a version segment precisely so this should never
  // trigger; the guard is what makes a wrong guess harmless.)
  const installations = isKagentInstallationList(data) ? data : undefined;
  const refetchedForeign = useRef(false);
  useEffect(() => {
    if (data !== undefined && !installations && !refetchedForeign.current) {
      refetchedForeign.current = true;
      void refetch();
    }
  }, [data, installations, refetch]);

  // Key the memo on contents: `data` identity is stable per fetch, but the
  // derived arrays below must not be rebuilt on unrelated renders either.
  const signature = installations
    ?.map(installation => `${installation.name}:${installation.reachable}`)
    .join('|');

  return useMemo(() => {
    const proxied =
      installations
        ?.filter(installation => installation.reachable !== false)
        .map(installation => installation.name) ?? [];
    const notReachable =
      installations
        ?.filter(installation => installation.reachable === false)
        .map(installation => installation.name) ?? [];
    const unreachableSet = new Set(notReachable);
    return {
      installations,
      isLoading,
      isError,
      proxied,
      notReachable,
      isNotReachable: (installation: string) =>
        unreachableSet.has(installation),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isLoading, isError]);
}
