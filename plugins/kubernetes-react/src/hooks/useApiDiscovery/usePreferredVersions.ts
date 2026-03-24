import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from '../../lib/k8s/CustomResourceMatcher';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../../lib/k8s/VersionTypes';
import { ErrorInfo, mapQueriesToClusters } from '../utils/queries';
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

export interface UsePreferredVersionsResult {
  /** Map of cluster name to resolved GVK */
  clustersGVKs: Record<string, CustomResourceMatcher>;
  /** Whether any discovery is in progress */
  isDiscovering: boolean;
  /** Discovery errors per cluster */
  discoveryErrors: ErrorInfo[];
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

  // Build map of cluster -> all versions where resource exists
  const clusterResourceVersions = useMemo(() => {
    const resourceVersions: Record<string, string[]> = {};
    clusters.forEach(cluster => {
      const versions = versionsToCheck[cluster] || [];
      const available: string[] = [];
      for (const version of versions) {
        const query = resourceQueries.find(
          q =>
            q.data?.cluster === cluster &&
            q.data?.version === version &&
            q.data?.hasResource,
        );
        if (query?.data?.hasResource) {
          available.push(version);
        }
      }
      resourceVersions[cluster] = available;
    });
    return resourceVersions;
  }, [clusters, versionsToCheck, resourceQueries]);

  const { clustersGVKs, incompatibilities, clientOutdatedStates } =
    useMemo(() => {
      const gvks: Record<string, CustomResourceMatcher> = {};
      const incompats: IncompatibilityState[] = [];
      const outdatedStates: ClientOutdatedState[] = [];

      clusters.forEach((cluster, index) => {
        const query = groupQueries[index];

        const resolved = resolvePreferredVersion({
          gvk,
          clientVersions: supportedVersions,
          cluster,
          shouldDiscover,
          discoverySucceeded: Boolean(query.data?.versions),
          serverVersions: clusterResourceVersions[cluster],
          discoveryError: query.error,
          fallbackToStatic,
        });

        // Only include compatible clusters in the GVKs map
        if (resolved.isCompatible) {
          gvks[cluster] = resolved.resolvedGVK;
        }
        if (resolved.incompatibility) {
          incompats.push(resolved.incompatibility);
        }
        if (resolved.clientOutdated) {
          outdatedStates.push(resolved.clientOutdated);
        }
      });

      return {
        clustersGVKs: gvks,
        incompatibilities: incompats,
        clientOutdatedStates: outdatedStates,
      };
    }, [
      clusters,
      gvk,
      groupQueries,
      clusterResourceVersions,
      shouldDiscover,
      supportedVersions,
      fallbackToStatic,
    ]);

  const discoveryErrors = useMemo(() => {
    if (!shouldDiscover) {
      return [];
    }
    const groupErrors = mapQueriesToClusters(clusters, groupQueries).errors;
    const resourceClusters = clusters.flatMap(cluster =>
      (versionsToCheck[cluster] || []).map(() => cluster),
    );
    const resourceErrors = mapQueriesToClusters(
      resourceClusters,
      resourceQueries,
    ).errors;
    return [...groupErrors, ...resourceErrors];
  }, [
    clusters,
    groupQueries,
    versionsToCheck,
    resourceQueries,
    shouldDiscover,
  ]);

  const isDiscovering =
    shouldDiscover &&
    (groupQueries.some(query => query.isLoading) ||
      resourceQueries.some(query => query.isLoading));

  return {
    clustersGVKs,
    isDiscovering,
    discoveryErrors,
    incompatibilities,
    clientOutdatedStates,
  };
}
