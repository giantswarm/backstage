import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import type { MusterInstallationInfo } from '../../apis/types';

// The backend's `/installations` carries each muster's reachability from an
// unauthenticated probe that may not have settled when the list is first read
// (a pod that just started answers 'unknown'). Re-read every few seconds until
// every entry is settled, then leave the list alone: a list pinned at 'unknown'
// would run the session probe against a muster the portal cannot reach.
export const INSTALLATIONS_REFETCH_WHILE_UNKNOWN_MS = 5_000;

/**
 * The key of the backend's installation list. Prefixed `muster` like every
 * read of this plugin, which is what keeps it out of the agent-platform
 * plugin's persisted cache when the hook runs under that client (the page
 * header) -- see `isUserScopedQueryKey` there.
 */
export function musterInstallationsQueryKey() {
  return ['muster', 'installations'] as const;
}

/** Whether any installation's reachability has not been probed yet. */
export function hasUnknownReachability(
  installations: MusterInstallationInfo[] | undefined,
): boolean {
  return Boolean(
    installations?.some(installation => installation.reachable === 'unknown'),
  );
}

/** Whether the backend reports the installation's muster as unreachable. */
export function isNotReachable(
  info: Pick<MusterInstallationInfo, 'reachable'> | undefined,
): boolean {
  return info?.reachable === false;
}

export type MusterInstallations = {
  /**
   * The backend's installations -- an endpoint the proxy can target, derived
   * from the base domain or configured -- with each one's auth posture and
   * reachability. Empty until the backend has answered.
   */
  installations: MusterInstallationInfo[];
  isLoading: boolean;
  /**
   * Whether the backend reports `installation` as not reachable from this
   * portal (`reachable === false`; `'unknown'` and an older backend without
   * the field are not acted on).
   */
  isNotReachable: (installation: string) => boolean;
};

/**
 * The muster installations the backend knows, with their reachability from
 * this portal. Needs no MusterInstanceProvider: the Agent Platform page
 * header's installation selector reads it to mark an installation whose muster
 * the portal cannot reach -- outside the muster section, under the
 * agent-platform plugin's query client -- and `MusterInstanceProvider` reads it
 * to build the section's installation list under the muster client.
 */
export function useMusterInstallations(): MusterInstallations {
  const musterApi = useApi(musterApiRef);

  const { data, isLoading } = useQuery({
    queryKey: musterInstallationsQueryKey(),
    queryFn: () => musterApi.listInstallations(),
    refetchInterval: query =>
      hasUnknownReachability(query.state.data?.installations)
        ? INSTALLATIONS_REFETCH_WHILE_UNKNOWN_MS
        : false,
  });

  const installations = useMemo(() => data?.installations ?? [], [data]);

  return useMemo(() => {
    const notReachable = new Set(
      installations.filter(isNotReachable).map(info => info.name),
    );
    return {
      installations,
      isLoading,
      isNotReachable: (installation: string) => notReachable.has(installation),
    };
  }, [installations, isLoading]);
}
