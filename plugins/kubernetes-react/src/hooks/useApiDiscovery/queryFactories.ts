import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
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

export const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Extracts supported versions from a GVK, handling both single-version
 * and multi-version resource matchers.
 */
export function getSupportedVersions(
  gvk: CustomResourceMatcher | MultiVersionResourceMatcher,
): readonly string[] {
  if ('supportedVersions' in gvk && gvk.supportedVersions.length > 0) {
    return gvk.supportedVersions;
  }
  return gvk.apiVersion ? [gvk.apiVersion] : [];
}

/**
 * Returns useQuery-compatible options for Stage 1 API group discovery.
 * Fetches /apis/{group} to get available versions.
 */
export function apiGroupQueryOptions(
  kubernetesApi: KubernetesApi,
  cluster: string,
  group: string,
) {
  return {
    queryKey: ['cluster', cluster, 'api-discovery', group],
    queryFn: async (): Promise<APIGroup> => {
      const path = `/apis/${group}`;
      const response = await kubernetesApi.proxy({
        clusterName: cluster,
        path,
      });

      if (!response.ok) {
        const error = new Error(
          `Failed to discover API group ${group} from ${cluster}. Reason: ${response.statusText}.`,
        );
        error.name = response.status === 404 ? 'NotFoundError' : error.name;
        error.name = response.status === 403 ? 'ForbiddenError' : error.name;
        throw error;
      }

      const apiGroup: APIGroup = await response.json();
      return apiGroup;
    },
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
    retry: false as const,
  };
}

/**
 * Returns useQuery-compatible options for Stage 2 resource verification.
 * Fetches /apis/{group}/{version} and checks if the resource exists.
 */
export function apiResourceQueryOptions(
  kubernetesApi: KubernetesApi,
  cluster: string,
  group: string,
  version: string,
  plural: string,
) {
  return {
    queryKey: ['cluster', cluster, 'api-resources', group, version, plural],
    queryFn: async (): Promise<{
      cluster: string;
      version: string;
      hasResource: boolean;
    }> => {
      const path = `/apis/${group}/${version}`;
      const response = await kubernetesApi.proxy({
        clusterName: cluster,
        path,
      });

      if (!response.ok) {
        return { cluster, version, hasResource: false };
      }

      const resourceList: APIResourceList = await response.json();
      const hasResource = resourceList.resources.some(r => r.name === plural);
      return { cluster, version, hasResource };
    },
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
    retry: false as const,
  };
}

/**
 * Computes the intersection of server and client versions, sorted newest-first.
 */
export function computeVersionsToCheck(
  serverVersions: string[],
  clientVersions: readonly string[],
): string[] {
  const clientSet = new Set(clientVersions);
  const compatible = serverVersions.filter(v => clientSet.has(v));
  return sortVersions(compatible).reverse();
}

interface ResolvePreferredVersionParams {
  gvk: CustomResourceMatcher | MultiVersionResourceMatcher;
  supportedVersions: readonly string[];
  cluster: string;
  shouldDiscover: boolean;
  explicitVersion?: string;
  serverVersions?: string[];
  serverPreferredVersion?: string;
  bestVersion?: string;
  discoveryError?: Error | null;
  fallbackToStatic: boolean;
}

interface ResolvePreferredVersionResult {
  resolvedGVK: ResolvedGVKWithCompatibility;
  queryEnabled: boolean;
  incompatibility: IncompatibilityState | undefined;
  clientOutdated: ClientOutdatedState | undefined;
}

/**
 * Pure function to resolve the preferred version given discovery results.
 * Handles explicit versions, core APIs, version compatibility, and fallback.
 */
export function resolvePreferredVersion(
  params: ResolvePreferredVersionParams,
): ResolvePreferredVersionResult {
  const {
    gvk,
    supportedVersions,
    cluster,
    shouldDiscover,
    explicitVersion,
    serverVersions,
    serverPreferredVersion,
    bestVersion,
    discoveryError,
    fallbackToStatic,
  } = params;

  const baseGVK: ResolvedGVKWithCompatibility = {
    ...gvk,
    supportedVersions,
    isDiscovered: false,
  };

  // If explicit version is provided, use it
  if (explicitVersion) {
    return {
      resolvedGVK: {
        ...baseGVK,
        apiVersion: explicitVersion,
      },
      queryEnabled: true,
      incompatibility: undefined,
      clientOutdated: undefined,
    };
  }

  // If discovery is disabled or it's a core API, use static version
  if (!shouldDiscover) {
    return {
      resolvedGVK: baseGVK,
      queryEnabled: true,
      incompatibility: undefined,
      clientOutdated: undefined,
    };
  }

  // If discovery succeeded, check version compatibility
  if (serverVersions) {
    const compatibility = checkVersionCompatibility(
      supportedVersions,
      serverVersions,
      bestVersion ?? serverPreferredVersion,
    );

    if (compatibility.isCompatible && compatibility.resolvedVersion) {
      const resolvedVersion = bestVersion ?? compatibility.resolvedVersion;

      let clientOutdated: ClientOutdatedState | undefined;
      if (compatibility.isClientOutdated) {
        const clientLatest = getLatestVersion(supportedVersions);
        const serverLatest = getLatestVersion(serverVersions);
        if (clientLatest && serverLatest) {
          clientOutdated = {
            resourceClass: gvk.plural,
            cluster,
            clientLatestVersion: clientLatest,
            serverLatestVersion: serverLatest,
            clientVersions: supportedVersions,
            serverVersions,
          };
        }
      }

      return {
        resolvedGVK: {
          ...baseGVK,
          apiVersion: resolvedVersion,
          isDiscovered: true,
          compatibility: {
            ...compatibility,
            resolvedVersion,
          },
        },
        queryEnabled: true,
        incompatibility: undefined,
        clientOutdated,
      };
    }

    // Incompatible versions
    return {
      resolvedGVK: {
        ...baseGVK,
        compatibility,
      },
      queryEnabled: false,
      incompatibility: {
        resourceClass: gvk.plural,
        cluster,
        clientVersions: supportedVersions,
        serverVersions,
      },
      clientOutdated: undefined,
    };
  }

  // If discovery failed and fallback is enabled, use static version
  if (discoveryError && fallbackToStatic) {
    return {
      resolvedGVK: baseGVK,
      queryEnabled: true,
      incompatibility: undefined,
      clientOutdated: undefined,
    };
  }

  // Default to static version while discovering (or on error without fallback)
  return {
    resolvedGVK: baseGVK,
    queryEnabled: true,
    incompatibility: undefined,
    clientOutdated: undefined,
  };
}
