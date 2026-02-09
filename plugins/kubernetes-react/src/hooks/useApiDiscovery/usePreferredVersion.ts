import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries, useQuery } from '@tanstack/react-query';
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

export interface UsePreferredVersionOptions {
  /** Enable API version discovery. Defaults to true. */
  enableDiscovery?: boolean;
  /** Explicit API version to use, bypasses discovery. */
  explicitVersion?: string;
  /** Fall back to static version on discovery error. Defaults to true. */
  fallbackToStatic?: boolean;
}

export interface UsePreferredVersionResult {
  /** The resolved GVK with the discovered or static apiVersion */
  resolvedGVK: ResolvedGVKWithCompatibility;
  /** Whether discovery is in progress */
  isDiscovering: boolean;
  /** Discovery error, if any */
  discoveryError: Error | null;
  /** Whether the resolved version was discovered from the cluster */
  isDiscovered: boolean;
  /** Whether the query should be enabled (false when incompatible) */
  queryEnabled: boolean;
  /** Incompatibility state when versions don't match, undefined if compatible */
  incompatibility: IncompatibilityState | undefined;
  /** Client outdated state when server has newer versions, undefined if not outdated */
  clientOutdated: ClientOutdatedState | undefined;
}

/**
 * Hook to resolve the preferred API version for a single cluster.
 * Uses Kubernetes API discovery to find the server's available versions
 * and checks compatibility with the resource class's supported versions.
 * Verifies that the resource actually exists at the resolved version (Stage 2).
 *
 * @param cluster - The cluster name
 * @param gvk - The static GVK from the resource class
 * @param options - Discovery options
 * @returns Resolved GVK with discovered or static version
 */
export function usePreferredVersion(
  cluster: string,
  gvk: CustomResourceMatcher | MultiVersionResourceMatcher,
  options: UsePreferredVersionOptions = {},
): UsePreferredVersionResult {
  const {
    enableDiscovery = true,
    explicitVersion,
    fallbackToStatic = true,
  } = options;

  const kubernetesApi = useApi(kubernetesApiRef);
  const supportedVersions = getSupportedVersions(gvk);

  // Skip discovery for core APIs (they use /api/v1 not /apis)
  // or when discovery is disabled or explicit version is provided
  const shouldDiscover =
    enableDiscovery && !gvk.isCore && !explicitVersion && Boolean(cluster);

  // Stage 1: Discover available API versions for the group
  const discoveryQuery = useQuery({
    ...apiGroupQueryOptions(kubernetesApi, cluster, gvk.group),
    enabled: shouldDiscover,
  });

  // Determine which versions to check (compatible versions sorted newest to oldest)
  const versionsToCheck = useMemo(() => {
    if (!discoveryQuery.data?.versions) {
      return [];
    }
    const serverVersions = discoveryQuery.data.versions.map(v => v.version);
    return computeVersionsToCheck(serverVersions, supportedVersions);
  }, [discoveryQuery.data, supportedVersions]);

  // Stage 2: Verify which versions actually have the resource
  // Uses useQueries so cache is shared with usePreferredVersions
  const resourceQueries = useQueries({
    queries: versionsToCheck.map(version => ({
      ...apiResourceQueryOptions(
        kubernetesApi,
        cluster,
        gvk.group,
        version,
        gvk.plural,
      ),
      enabled: shouldDiscover && versionsToCheck.length > 0,
    })),
  });

  // Find the best version (first from newest to oldest that has the resource)
  const bestVersion = useMemo(() => {
    for (const version of versionsToCheck) {
      const query = resourceQueries.find(
        q =>
          q.data?.cluster === cluster &&
          q.data?.version === version &&
          q.data?.hasResource,
      );
      if (query?.data?.hasResource) {
        return version;
      }
    }
    return undefined;
  }, [versionsToCheck, resourceQueries, cluster]);

  const serverVersions = discoveryQuery.data?.versions
    ? discoveryQuery.data.versions.map(v => v.version)
    : undefined;

  const result = useMemo(
    () =>
      resolvePreferredVersion({
        gvk,
        supportedVersions,
        cluster,
        shouldDiscover,
        explicitVersion,
        serverVersions,
        serverPreferredVersion: discoveryQuery.data?.preferredVersion?.version,
        bestVersion,
        discoveryError: discoveryQuery.error,
        fallbackToStatic,
      }),
    [
      gvk,
      supportedVersions,
      cluster,
      shouldDiscover,
      explicitVersion,
      serverVersions,
      discoveryQuery.data?.preferredVersion?.version,
      bestVersion,
      discoveryQuery.error,
      fallbackToStatic,
    ],
  );

  const isDiscovering =
    shouldDiscover &&
    (discoveryQuery.isLoading ||
      resourceQueries.some(query => query.isLoading));

  return {
    resolvedGVK: result.resolvedGVK,
    isDiscovering,
    discoveryError: discoveryQuery.error,
    isDiscovered: result.resolvedGVK.isDiscovered ?? false,
    queryEnabled: result.queryEnabled,
    incompatibility: result.incompatibility,
    clientOutdated: result.clientOutdated,
  };
}
