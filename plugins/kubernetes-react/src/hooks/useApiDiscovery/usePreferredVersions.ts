import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from '../../lib/k8s/CustomResourceMatcher';
import {
  APIGroup,
  ResolvedGVKWithCompatibility,
} from '../../lib/k8s/ApiDiscovery';
import { IncompatibilityState } from '../../lib/k8s/VersionTypes';
import { checkVersionCompatibility } from '../../lib/k8s/versionUtils';

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
  clustersGVKs: Record<string, ResolvedGVKWithCompatibility>;
  /** Whether any discovery is in progress */
  isDiscovering: boolean;
  /** Discovery errors per cluster */
  discoveryErrors: DiscoveryError[];
  /** Whether all discoveries have completed */
  isReady: boolean;
  /** Map of cluster name to whether query should be enabled */
  clustersQueryEnabled: Record<string, boolean>;
  /** List of incompatibility states for clusters with version mismatches */
  incompatibilities: IncompatibilityState[];
}

/**
 * Extracts supported versions from a GVK, handling both single-version
 * and multi-version resource matchers.
 */
function getSupportedVersions(
  gvk: CustomResourceMatcher | MultiVersionResourceMatcher,
): readonly string[] {
  // Check if it's a MultiVersionResourceMatcher
  if ('supportedVersions' in gvk && gvk.supportedVersions.length > 0) {
    return gvk.supportedVersions;
  }
  // Fallback to single apiVersion
  return gvk.apiVersion ? [gvk.apiVersion] : [];
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
  gvk: CustomResourceMatcher | MultiVersionResourceMatcher,
  options: UsePreferredVersionsOptions = {},
): UsePreferredVersionsResult {
  const { enableDiscovery = true, fallbackToStatic = true } = options;

  const kubernetesApi = useApi(kubernetesApiRef);
  const supportedVersions = getSupportedVersions(gvk);

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

  const { clustersGVKs, clustersQueryEnabled, incompatibilities } =
    useMemo(() => {
      const gvks: Record<string, ResolvedGVKWithCompatibility> = {};
      const queryEnabled: Record<string, boolean> = {};
      const incompats: IncompatibilityState[] = [];

      const baseGVK: ResolvedGVKWithCompatibility = {
        ...gvk,
        supportedVersions,
        isDiscovered: false,
      };

      clusters.forEach((cluster, index) => {
        if (!shouldDiscover) {
          gvks[cluster] = baseGVK;
          queryEnabled[cluster] = true;
          return;
        }

        const query = queries[index];

        if (query.data?.versions) {
          const serverVersions = query.data.versions.map(v => v.version);
          const compatibility = checkVersionCompatibility(
            supportedVersions,
            serverVersions,
          );

          if (compatibility.isCompatible && compatibility.resolvedVersion) {
            gvks[cluster] = {
              ...baseGVK,
              apiVersion: compatibility.resolvedVersion,
              isDiscovered: true,
              compatibility,
            };
            queryEnabled[cluster] = true;
          } else {
            // Incompatible versions
            gvks[cluster] = {
              ...baseGVK,
              compatibility,
            };
            queryEnabled[cluster] = false;
            incompats.push({
              resourceClass: gvk.plural,
              cluster,
              clientVersions: supportedVersions,
              serverVersions,
            });
          }
        } else if (query.error && fallbackToStatic) {
          gvks[cluster] = baseGVK;
          queryEnabled[cluster] = true;
        } else {
          // Default to static version while discovering or on error without fallback
          gvks[cluster] = baseGVK;
          queryEnabled[cluster] = true;
        }
      });

      return {
        clustersGVKs: gvks,
        clustersQueryEnabled: queryEnabled,
        incompatibilities: incompats,
      };
    }, [
      clusters,
      gvk,
      queries,
      shouldDiscover,
      supportedVersions,
      fallbackToStatic,
    ]);

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
    clustersQueryEnabled,
    incompatibilities,
  };
}
