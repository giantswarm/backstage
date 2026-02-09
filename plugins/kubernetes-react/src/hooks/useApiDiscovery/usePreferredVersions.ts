import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from '../../lib/k8s/CustomResourceMatcher';
import { ResolvedGVKWithCompatibility } from '../../lib/k8s/ApiDiscovery';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../../lib/k8s/VersionTypes';
import {
  getSupportedVersions,
  apiGroupQueryOptions,
  apiResourceQueryOptions,
  computeVersionsToCheck,
  resolvePreferredVersion,
} from './queryFactories';

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
      ...apiGroupQueryOptions(kubernetesApi, cluster, gvk.group),
      enabled: shouldDiscover,
    })),
  });

  // Determine which versions to check for each cluster (compatible versions sorted newest to oldest)
  const versionsToCheck = useMemo(() => {
    const result: Record<string, string[]> = {};
    clusters.forEach((cluster, index) => {
      const query = groupQueries[index];
      if (query.data?.versions) {
        const serverVersions = query.data.versions.map(v => v.version);
        result[cluster] = computeVersionsToCheck(
          serverVersions,
          supportedVersions,
        );
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
        ...apiResourceQueryOptions(
          kubernetesApi,
          cluster,
          gvk.group,
          version,
          gvk.plural,
        ),
        enabled: shouldDiscover && versions.length > 0,
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

    clusters.forEach((cluster, index) => {
      const query = groupQueries[index];
      const serverVersions = query.data?.versions
        ? query.data.versions.map(v => v.version)
        : undefined;

      const resolved = resolvePreferredVersion({
        gvk,
        supportedVersions,
        cluster,
        shouldDiscover,
        serverVersions,
        serverPreferredVersion: query.data?.preferredVersion?.version,
        bestVersion: clusterBestVersions[cluster],
        discoveryError: query.error,
        fallbackToStatic,
      });

      gvks[cluster] = resolved.resolvedGVK;
      queryEnabled[cluster] = resolved.queryEnabled;
      if (resolved.incompatibility) {
        incompats.push(resolved.incompatibility);
      }
      if (resolved.clientOutdated) {
        outdatedStates.push(resolved.clientOutdated);
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
