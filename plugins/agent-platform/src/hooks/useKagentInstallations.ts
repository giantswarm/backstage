import { useEffect, useMemo, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
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
 * {@link REFETCH_WHILE_UNKNOWN_MS}), and which may say "not reachable" for
 * an outage that ends (see {@link NEGATIVE_REACHABILITY_STALE_TIME_MS}).
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

/**
 * How long a list reporting any installation **not reachable** counts as
 * fresh, and how often it is re-read while it says so.
 *
 * The positive answer is cached for {@link KAGENT_INSTALLATIONS_STALE_TIME_MS}
 * and persisted to localStorage, which is right for a fact that changes with
 * config. A negative answer is a transient fact -- a kagent controller
 * restarting, a lab coming up -- and under the hour-long stale time it
 * outlived the outage by up to an hour: every Usage and Sessions view read
 * "not reachable from this portal" and made no calls, across reloads, while
 * the backend's own probe already said reachable again. The backend re-probes
 * a negative after 30 s (gs-node's `DEFAULT_NEGATIVE_REACHABILITY_TTL_MS`), so
 * a minute here sees a recovery within about 90 s, at the price of one cheap,
 * backend-cached call a minute while an installation stays unreachable.
 */
export const NEGATIVE_REACHABILITY_STALE_TIME_MS = 60_000;

export function hasUnknownReachability(
  installations: KagentInstallation[] | undefined,
): boolean {
  return Boolean(
    installations?.some(installation => installation.reachable === 'unknown'),
  );
}

export function hasNegativeReachability(
  installations: KagentInstallation[] | undefined,
): boolean {
  return Boolean(
    installations?.some(installation => installation.reachable === false),
  );
}

/**
 * How long a list counts as fresh: briefly while a probe is unsettled or an
 * installation is reported unreachable, an hour once every one is reachable.
 * Applied to a list rehydrated from localStorage too (`dataUpdatedAt` is
 * persisted), so a negative answer from an earlier visit is re-read on the
 * first mount after a minute rather than trusted for the rest of its hour.
 * Takes `unknown` because a rehydrated entry may be of a foreign shape.
 */
export function kagentInstallationsStaleTime(data: unknown): number {
  const installations = isKagentInstallationList(data) ? data : undefined;
  if (hasUnknownReachability(installations)) {
    return REFETCH_WHILE_UNKNOWN_MS;
  }
  if (hasNegativeReachability(installations)) {
    return NEGATIVE_REACHABILITY_STALE_TIME_MS;
  }
  return KAGENT_INSTALLATIONS_STALE_TIME_MS;
}

/**
 * The poll while the answer is provisional, so a page left open notices a
 * recovery without a navigation; none once every installation is reachable.
 */
export function kagentInstallationsRefetchInterval(
  data: unknown,
): number | false {
  const installations = isKagentInstallationList(data) ? data : undefined;
  if (hasUnknownReachability(installations)) {
    return REFETCH_WHILE_UNKNOWN_MS;
  }
  if (hasNegativeReachability(installations)) {
    return NEGATIVE_REACHABILITY_STALE_TIME_MS;
  }
  return false;
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
 * `QueryClientProvider` (installation state, identical for every user) --
 * an hour only while every installation is reachable; a negative answer is
 * fresh for {@link NEGATIVE_REACHABILITY_STALE_TIME_MS}. Shared
 * by the sessions provider (which decides whom to query) and the capabilities
 * probe (which must not identity-probe an installation nothing can reach), so
 * the two never disagree about an installation.
 */
export function useKagentInstallations(): KagentInstallations {
  const kagentApi = useApi(kagentApiRef);

  const { data, isError, refetch, isPending, fetchStatus } = useQuery({
    queryKey: kagentInstallationsQueryKey(),
    queryFn: () => kagentApi.listInstallations(),
    staleTime: query => kagentInstallationsStaleTime(query.state.data),
    refetchInterval: query =>
      kagentInstallationsRefetchInterval(query.state.data),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

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
