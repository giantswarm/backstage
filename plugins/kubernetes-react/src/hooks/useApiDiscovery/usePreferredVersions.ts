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
  APIResourceList,
  ResolvedGVKWithCompatibility,
} from '../../lib/k8s/ApiDiscovery';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../../lib/k8s/VersionTypes';
import {
  checkVersionCompatibility,
  getLatestVersion,
  sortVersions,
} from '../../lib/k8s/versionUtils';

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
  /** List of client outdated states for clusters where server has newer versions */
  clientOutdatedStates: ClientOutdatedState[];
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

  // Stage 1: Query API group to get available versions
  const groupQueries = useQueries({
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

  // Determine which versions to check for each cluster (compatible versions sorted newest to oldest)
  const versionsToCheck = useMemo(() => {
    const result: Record<string, string[]> = {};
    clusters.forEach((cluster, index) => {
      const query = groupQueries[index];
      if (query.data?.versions) {
        const serverVersions = query.data.versions.map(v => v.version);
        const clientSet = new Set(supportedVersions);
        const compatible = serverVersions.filter(v => clientSet.has(v));
        // Sort from newest to oldest so we prefer newer versions
        result[cluster] = sortVersions(compatible).reverse();
      } else {
        result[cluster] = [];
      }
    });
    return result;
  }, [clusters, groupQueries, supportedVersions]);

  // Stage 2: For each cluster, query API resources for each compatible version
  // to find which version actually has our resource
  const resourceQueries = useQueries({
    queries: clusters.flatMap(cluster => {
      const versions = versionsToCheck[cluster] || [];
      return versions.map(version => ({
        queryKey: [
          'cluster',
          cluster,
          'api-resources',
          gvk.group,
          version,
          gvk.plural,
        ],
        queryFn: async (): Promise<{
          cluster: string;
          version: string;
          hasResource: boolean;
        }> => {
          const path = `/apis/${gvk.group}/${version}`;
          const response = await kubernetesApi.proxy({
            clusterName: cluster,
            path,
          });

          if (!response.ok) {
            // If we get 404, the version doesn't exist for this resource
            return { cluster, version, hasResource: false };
          }

          const resourceList: APIResourceList = await response.json();
          const hasResource = resourceList.resources.some(
            r => r.name === gvk.plural,
          );
          return { cluster, version, hasResource };
        },
        enabled: shouldDiscover && versions.length > 0,
        staleTime: CACHE_TIME,
        gcTime: CACHE_TIME,
        retry: false,
      }));
    }),
  });

  // Build a map of cluster -> best version (first version that has the resource)
  const clusterBestVersions = useMemo(() => {
    const result: Record<string, string | undefined> = {};
    clusters.forEach(cluster => {
      const versions = versionsToCheck[cluster] || [];
      // Find the first version (from newest to oldest) that has the resource
      for (const version of versions) {
        const query = resourceQueries.find(
          q =>
            q.data?.cluster === cluster &&
            q.data?.version === version &&
            q.data?.hasResource,
        );
        if (query?.data?.hasResource) {
          result[cluster] = version;
          break;
        }
      }
    });
    return result;
  }, [clusters, versionsToCheck, resourceQueries]);

  const {
    clustersGVKs,
    clustersQueryEnabled,
    incompatibilities,
    clientOutdatedStates,
  } = useMemo(() => {
    const gvks: Record<string, ResolvedGVKWithCompatibility> = {};
    const queryEnabled: Record<string, boolean> = {};
    const incompats: IncompatibilityState[] = [];
    const outdatedStates: ClientOutdatedState[] = [];

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

      const query = groupQueries[index];

      if (query.data?.versions) {
        const serverVersions = query.data.versions.map(v => v.version);
        const serverPreferredVersion = query.data.preferredVersion?.version;

        // Use the best version that actually has the resource, if discovered
        const bestVersion = clusterBestVersions[cluster];

        const compatibility = checkVersionCompatibility(
          supportedVersions,
          serverVersions,
          // Prefer the version that actually has the resource over the server's preferred
          bestVersion ?? serverPreferredVersion,
        );

        if (compatibility.isCompatible && compatibility.resolvedVersion) {
          // If we discovered a best version, use it; otherwise use compatibility result
          const resolvedVersion = bestVersion ?? compatibility.resolvedVersion;

          gvks[cluster] = {
            ...baseGVK,
            apiVersion: resolvedVersion,
            isDiscovered: true,
            compatibility: {
              ...compatibility,
              resolvedVersion,
            },
          };
          queryEnabled[cluster] = true;

          // Check if client is outdated (compatible but server has newer versions)
          if (compatibility.isClientOutdated) {
            const clientLatest = getLatestVersion(supportedVersions);
            const serverLatest = getLatestVersion(serverVersions);
            if (clientLatest && serverLatest) {
              outdatedStates.push({
                resourceClass: gvk.plural,
                cluster,
                clientLatestVersion: clientLatest,
                serverLatestVersion: serverLatest,
                clientVersions: supportedVersions,
                serverVersions,
              });
            }
          }
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
      clientOutdatedStates: outdatedStates,
    };
  }, [
    clusters,
    gvk,
    groupQueries,
    clusterBestVersions,
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
        const query = groupQueries[index];
        if (query.error) {
          return { cluster, error: query.error };
        }
        return null;
      })
      .filter((error): error is DiscoveryError => error !== null);
  }, [clusters, groupQueries, shouldDiscover]);

  const isDiscovering =
    shouldDiscover &&
    (groupQueries.some(query => query.isLoading) ||
      resourceQueries.some(query => query.isLoading));
  const isReady =
    !shouldDiscover ||
    (groupQueries.every(query => !query.isLoading && !query.error) &&
      resourceQueries.every(query => !query.isLoading));

  return {
    clustersGVKs,
    isDiscovering,
    discoveryErrors,
    isReady,
    clustersQueryEnabled,
    incompatibilities,
    clientOutdatedStates,
  };
}
