import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { modelManagerApiRef } from '../apis';
import { modelManagerInstallationsQueryKey } from '../lib/queryKeys';

/**
 * The configured set changes on a Backstage redeploy, not on navigation, so
 * keep it warm.
 */
const STALE_TIME = 5 * 60 * 1000;

export type ModelManagerInstallations = {
  /**
   * Installations (in input order) that are both reachable and have a
   * model-manager configured for the backend proxy.
   */
  installations: string[];
  /** The configured list has not answered yet (the set may still grow). */
  isLoading: boolean;
  /**
   * The configured list could not be read at all — an older backend without
   * the route, or the backend being down. Nothing is model-manager-backed then;
   * exposed so a caller can say so rather than silently showing nothing.
   */
  error?: Error;
};

/**
 * Narrows installations to those the backend proxies model-manager for — the
 * gate for the model-manager serving source, so portals whose configuration
 * names no model-manager never probe one, and installations without it show
 * nothing (as they do without KServe).
 */
export function useModelManagerInstallations(
  reachableInstallations: string[],
): ModelManagerInstallations {
  const modelManagerApi = useApi(modelManagerApiRef);

  const query = useQuery({
    queryKey: modelManagerInstallationsQueryKey(),
    queryFn: () => modelManagerApi.listInstallations(),
    staleTime: STALE_TIME,
  });

  const configured = query.data;
  const reachableKey = reachableInstallations.join(',');
  return useMemo(
    () => ({
      installations: configured
        ? reachableInstallations.filter(name => configured.includes(name))
        : [],
      isLoading: query.isLoading,
      error: query.error ?? undefined,
    }),
    // `reachableInstallations` is derived fresh each render; key on its
    // contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configured, reachableKey, query.isLoading, query.error],
  );
}
