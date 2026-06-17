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
import { sortVersions } from '../../lib/k8s/versionUtils';
import {
  getSupportedVersions,
  apiGroupQueryOptions,
  apiResourceQueryOptions,
  resolvePreferredVersion,
} from './queryFactories';

export interface UsePreferredVersionsOptions {
  /** Enable API version discovery. Defaults to true. */
  enableDiscovery?: boolean;
  /** Explicit API version to use, bypasses discovery. */
  explicitVersion?: string;
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
  const {
    enableDiscovery = true,
    explicitVersion,
    fallbackToStatic = true,
  } = options;

  const kubernetesApi = useApi(kubernetesApiRef);
  const supportedVersions = getSupportedVersions(gvk);

  // Skip discovery for core APIs (they use /api/v1 not /apis)
  // or when an explicit version is provided
  const shouldDiscover = enableDiscovery && !gvk.isCore && !explicitVersion;

  // Stage 1: Query API group to get available versions
  const groupQueries = useQueries({
    queries: clusters.map(cluster => ({
      ...apiGroupQueryOptions(kubernetesApi, cluster, gvk.group),
      enabled: shouldDiscover,
    })),
  });

  // Collect all group versions for each cluster (sorted newest-first)
  // We query all versions in Stage 2 (not just client-compatible ones) so that
  // serverVersions reflects the true set of versions where the resource exists,
  // enabling correct client-outdated detection.
  const versionsToCheck = useMemo(() => {
    const result: Record<string, string[]> = {};
    clusters.forEach((cluster, index) => {
      const query = groupQueries[index];
      if (query.data?.versions) {
        const versions = query.data.versions.map(v => v.version);
        result[cluster] = sortVersions(versions).reverse();
      } else {
        result[cluster] = [];
      }
    });
    return result;
  }, [clusters, groupQueries]);

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

  // Track which clusters have finished discovery (Stage 1 + any Stage 2
  // queries settled, success or error). This lets list queries start per
  // cluster as soon as that cluster resolves, instead of waiting for the
  // slowest/hung cluster in the fleet.
  const clusterDiscoveryComplete = useMemo(() => {
    const complete: Record<string, boolean> = {};
    let resourceIndex = 0;
    clusters.forEach((cluster, index) => {
      const versions = versionsToCheck[cluster] || [];
      const clusterResourceQueries = resourceQueries.slice(
        resourceIndex,
        resourceIndex + versions.length,
      );
      resourceIndex += versions.length;

      if (!shouldDiscover) {
        complete[cluster] = true;
        return;
      }
      const groupSettled = !groupQueries[index].isLoading;
      const resourcesSettled = clusterResourceQueries.every(q => !q.isLoading);
      complete[cluster] = groupSettled && resourcesSettled;
    });
    return complete;
  }, [
    clusters,
    groupQueries,
    versionsToCheck,
    resourceQueries,
    shouldDiscover,
  ]);

  const { clustersGVKs, incompatibilities, clientOutdatedStates } =
    useMemo(() => {
      const gvks: Record<string, CustomResourceMatcher> = {};
      const incompats: IncompatibilityState[] = [];
      const outdatedStates: ClientOutdatedState[] = [];

      clusters.forEach((cluster, index) => {
        const query = groupQueries[index];

        // Don't resolve a GVK (and therefore don't start the list query) until
        // this cluster's own discovery has settled. Avoids listing with a
        // fallback version that discovery is about to refine.
        if (!clusterDiscoveryComplete[cluster]) {
          return;
        }

        const resolved = resolvePreferredVersion({
          gvk,
          clientVersions: supportedVersions,
          cluster,
          shouldDiscover,
          explicitVersion,
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
      groupQueries,
      gvk,
      supportedVersions,
      shouldDiscover,
      explicitVersion,
      clusterResourceVersions,
      fallbackToStatic,
      clusterDiscoveryComplete,
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

  // Don't report incompatibilities while discovery is still in progress —
  // partial Stage 2 results can cause false positives (e.g. a transient error
  // making it look like a version doesn't exist).
  return {
    clustersGVKs,
    isDiscovering,
    discoveryErrors,
    incompatibilities: isDiscovering ? [] : incompatibilities,
    clientOutdatedStates: isDiscovering ? [] : clientOutdatedStates,
  };
}
