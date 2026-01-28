import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { APIGroup, ResolvedGVK } from '../../lib/k8s/ApiDiscovery';

const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

export interface UsePreferredVersionsOptions {
  /** Enable API version discovery. Defaults to true. */
  enableDiscovery?: boolean;
  /** Fall back to static version on discovery error. Defaults to true. */
  fallbackToStatic?: boolean;
}

export interface DiscoveryError {
  cluster: string;
  error: Error;
}

export interface UsePreferredVersionsResult {
  /** Map of cluster name to resolved GVK */
  clustersGVKs: Record<string, ResolvedGVK>;
  /** Whether any discovery is in progress */
  isDiscovering: boolean;
  /** Discovery errors per cluster */
  discoveryErrors: DiscoveryError[];
  /** Whether all discoveries have completed */
  isReady: boolean;
}

/**
 * Hook to resolve the preferred API version for multiple clusters.
 * Uses Kubernetes API discovery to find the server's preferred version
 * for the given API group on each cluster.
 *
 * @param clusters - Array of cluster names
 * @param gvk - The static GVK from the resource class
 * @param options - Discovery options
 * @returns Map of cluster names to resolved GVKs
 */
export function usePreferredVersions(
  clusters: string[],
  gvk: CustomResourceMatcher,
  options: UsePreferredVersionsOptions = {},
): UsePreferredVersionsResult {
  const { enableDiscovery = true, fallbackToStatic = true } = options;

  const kubernetesApi = useApi(kubernetesApiRef);

  // Skip discovery for core APIs (they use /api/v1 not /apis)
  const shouldDiscover = enableDiscovery && !gvk.isCore;

  const queries = useQueries({
    queries: clusters.map(cluster => ({
      queryKey: ['cluster', cluster, 'api-discovery', gvk.group],
      queryFn: async (): Promise<APIGroup> => {
        const path = `/apis/${gvk.group}`;
        const response = await kubernetesApi.proxy({
          clusterName: cluster,
          path,
        });

        if (!response.ok) {
          const error = new Error(
            `Failed to discover API group ${gvk.group} from ${cluster}. Reason: ${response.statusText}.`,
          );
          error.name = response.status === 404 ? 'NotFoundError' : error.name;
          error.name = response.status === 403 ? 'ForbiddenError' : error.name;
          throw error;
        }

        return response.json();
      },
      enabled: shouldDiscover,
      staleTime: CACHE_TIME,
      gcTime: CACHE_TIME,
      retry: false,
    })),
  });

  const clustersGVKs = useMemo(() => {
    const result: Record<string, ResolvedGVK> = {};

    clusters.forEach((cluster, index) => {
      if (!shouldDiscover) {
        result[cluster] = {
          ...gvk,
          isDiscovered: false,
        };
        return;
      }

      const query = queries[index];

      if (query.data?.preferredVersion) {
        result[cluster] = {
          ...gvk,
          apiVersion: query.data.preferredVersion.version,
          isDiscovered: true,
        };
      } else if (query.error && fallbackToStatic) {
        result[cluster] = {
          ...gvk,
          isDiscovered: false,
        };
      } else {
        // Default to static version while discovering or on error without fallback
        result[cluster] = {
          ...gvk,
          isDiscovered: false,
        };
      }
    });

    return result;
  }, [clusters, gvk, queries, shouldDiscover, fallbackToStatic]);

  const discoveryErrors = useMemo(() => {
    if (!shouldDiscover) {
      return [];
    }

    return clusters
      .map((cluster, index) => {
        const query = queries[index];
        if (query.error) {
          return { cluster, error: query.error };
        }
        return null;
      })
      .filter((error): error is DiscoveryError => error !== null);
  }, [clusters, queries, shouldDiscover]);

  const isDiscovering =
    shouldDiscover && queries.some(query => query.isLoading);
  const isReady =
    !shouldDiscover || queries.every(query => !query.isLoading && !query.error);

  return {
    clustersGVKs,
    isDiscovering,
    discoveryErrors,
    isReady,
  };
}
