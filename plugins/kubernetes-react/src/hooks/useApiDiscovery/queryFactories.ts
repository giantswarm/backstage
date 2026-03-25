import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from '../../lib/k8s/CustomResourceMatcher';
import { APIGroup, APIResourceList } from '../../lib/k8s/ApiDiscovery';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../../lib/k8s/VersionTypes';
import {
  checkVersionCompatibility,
  getLatestVersion,
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

interface ResolvePreferredVersionParams {
  gvk: CustomResourceMatcher | MultiVersionResourceMatcher;
  clientVersions: readonly string[];
  cluster: string;
  shouldDiscover: boolean;
  explicitVersion?: string;
  /** Whether Stage 1 API group discovery succeeded */
  discoverySucceeded: boolean;
  /** Versions where the specific resource actually exists on the server */
  serverVersions?: string[];
  discoveryError?: Error | null;
  fallbackToStatic: boolean;
}

interface ResolvePreferredVersionResult {
  resolvedGVK: CustomResourceMatcher;
  isCompatible: boolean;
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
    clientVersions,
    cluster,
    shouldDiscover,
    explicitVersion,
    discoverySucceeded,
    serverVersions,
    discoveryError,
    fallbackToStatic,
  } = params;

  const defaultResult: ResolvePreferredVersionResult = {
    resolvedGVK: gvk,
    isCompatible: true,
    incompatibility: undefined,
    clientOutdated: undefined,
  };

  // If explicit version is provided, use it
  if (explicitVersion) {
    return {
      ...defaultResult,
      resolvedGVK: { ...gvk, apiVersion: explicitVersion },
    };
  }

  // If discovery is disabled or it's a core API, use static version
  if (!shouldDiscover) {
    return defaultResult;
  }

  // If discovery succeeded, check version compatibility using resource-level
  // versions (where the resource actually exists on the server).
  if (discoverySucceeded && serverVersions && serverVersions.length > 0) {
    const compatibility = checkVersionCompatibility(
      clientVersions,
      serverVersions,
    );

    if (compatibility.isCompatible && compatibility.resolvedVersion) {
      const resolvedVersion = compatibility.resolvedVersion;

      let clientOutdated: ClientOutdatedState | undefined;
      if (compatibility.isClientOutdated) {
        const clientLatestVersion = getLatestVersion(clientVersions);
        const serverLatestVersion = getLatestVersion(serverVersions);
        if (clientLatestVersion && serverLatestVersion) {
          clientOutdated = {
            resourceClass: gvk.plural,
            cluster,
            clientLatestVersion,
            serverLatestVersion,
            clientVersions,
            serverVersions,
          };
        }
      }

      return {
        resolvedGVK: { ...gvk, apiVersion: resolvedVersion },
        isCompatible: true,
        incompatibility: undefined,
        clientOutdated,
      };
    }

    // Incompatible versions
    return {
      resolvedGVK: gvk,
      isCompatible: false,
      incompatibility: {
        resourceClass: gvk.plural,
        cluster,
        clientVersions,
        serverVersions,
      },
      clientOutdated: undefined,
    };
  }

  // If discovery failed and fallback is enabled, use static version
  if (discoveryError && fallbackToStatic) {
    return defaultResult;
  }

  // Default to static version while discovering (or on error without fallback)
  return defaultResult;
}
