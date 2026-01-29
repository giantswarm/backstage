import { useMemo } from 'react';
import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from '../../lib/k8s/CustomResourceMatcher';
import { ResolvedGVKWithCompatibility } from '../../lib/k8s/ApiDiscovery';
import { IncompatibilityState } from '../../lib/k8s/VersionTypes';
import { checkVersionCompatibility } from '../../lib/k8s/versionUtils';
import { useApiDiscovery } from './useApiDiscovery';

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
 * Hook to resolve the preferred API version for a single cluster.
 * Uses Kubernetes API discovery to find the server's available versions
 * and checks compatibility with the resource class's supported versions.
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

  const supportedVersions = getSupportedVersions(gvk);

  // Skip discovery for core APIs (they use /api/v1 not /apis)
  // or when discovery is disabled or explicit version is provided
  const shouldDiscover =
    enableDiscovery && !gvk.isCore && !explicitVersion && Boolean(cluster);

  const discoveryQuery = useApiDiscovery(cluster, gvk.group, {
    enabled: shouldDiscover,
  });

  const result = useMemo((): {
    resolvedGVK: ResolvedGVKWithCompatibility;
    queryEnabled: boolean;
    incompatibility: IncompatibilityState | undefined;
  } => {
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
      };
    }

    // If discovery is disabled or it's a core API, use static version
    if (!shouldDiscover) {
      return {
        resolvedGVK: baseGVK,
        queryEnabled: true,
        incompatibility: undefined,
      };
    }

    // If discovery succeeded, check version compatibility
    if (discoveryQuery.data?.versions) {
      const serverVersions = discoveryQuery.data.versions.map(v => v.version);
      const compatibility = checkVersionCompatibility(
        supportedVersions,
        serverVersions,
      );

      if (compatibility.isCompatible && compatibility.resolvedVersion) {
        return {
          resolvedGVK: {
            ...baseGVK,
            apiVersion: compatibility.resolvedVersion,
            isDiscovered: true,
            compatibility,
          },
          queryEnabled: true,
          incompatibility: undefined,
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
      };
    }

    // If discovery failed and fallback is enabled, use static version
    if (discoveryQuery.error && fallbackToStatic) {
      return {
        resolvedGVK: baseGVK,
        queryEnabled: true,
        incompatibility: undefined,
      };
    }

    // Default to static version while discovering (or on error without fallback)
    return {
      resolvedGVK: baseGVK,
      queryEnabled: true,
      incompatibility: undefined,
    };
  }, [
    gvk,
    cluster,
    explicitVersion,
    shouldDiscover,
    supportedVersions,
    discoveryQuery.data,
    discoveryQuery.error,
    fallbackToStatic,
  ]);

  return {
    resolvedGVK: result.resolvedGVK,
    isDiscovering: shouldDiscover && discoveryQuery.isLoading,
    discoveryError: discoveryQuery.error,
    isDiscovered: result.resolvedGVK.isDiscovered ?? false,
    queryEnabled: result.queryEnabled,
    incompatibility: result.incompatibility,
  };
}
