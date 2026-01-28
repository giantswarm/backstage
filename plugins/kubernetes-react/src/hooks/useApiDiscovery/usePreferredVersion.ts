import { useMemo } from 'react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { ResolvedGVK } from '../../lib/k8s/ApiDiscovery';
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
  resolvedGVK: ResolvedGVK;
  /** Whether discovery is in progress */
  isDiscovering: boolean;
  /** Discovery error, if any */
  discoveryError: Error | null;
  /** Whether the resolved version was discovered from the cluster */
  isDiscovered: boolean;
}

/**
 * Hook to resolve the preferred API version for a single cluster.
 * Uses Kubernetes API discovery to find the server's preferred version
 * for the given API group.
 *
 * @param cluster - The cluster name
 * @param gvk - The static GVK from the resource class
 * @param options - Discovery options
 * @returns Resolved GVK with discovered or static version
 */
export function usePreferredVersion(
  cluster: string,
  gvk: CustomResourceMatcher,
  options: UsePreferredVersionOptions = {},
): UsePreferredVersionResult {
  const {
    enableDiscovery = true,
    explicitVersion,
    fallbackToStatic = true,
  } = options;

  // Skip discovery for core APIs (they use /api/v1 not /apis)
  // or when discovery is disabled or explicit version is provided
  const shouldDiscover =
    enableDiscovery && !gvk.isCore && !explicitVersion && Boolean(cluster);

  const discoveryQuery = useApiDiscovery(cluster, gvk.group, {
    enabled: shouldDiscover,
  });

  const resolvedGVK = useMemo((): ResolvedGVK => {
    // If explicit version is provided, use it
    if (explicitVersion) {
      return {
        ...gvk,
        apiVersion: explicitVersion,
        isDiscovered: false,
      };
    }

    // If discovery is disabled or it's a core API, use static version
    if (!shouldDiscover) {
      return {
        ...gvk,
        isDiscovered: false,
      };
    }

    // If discovery succeeded, use the preferred version
    if (discoveryQuery.data?.preferredVersion) {
      return {
        ...gvk,
        apiVersion: discoveryQuery.data.preferredVersion.version,
        isDiscovered: true,
      };
    }

    // If discovery failed and fallback is enabled, use static version
    if (discoveryQuery.error && fallbackToStatic) {
      return {
        ...gvk,
        isDiscovered: false,
      };
    }

    // Default to static version while discovering
    return {
      ...gvk,
      isDiscovered: false,
    };
  }, [
    gvk,
    explicitVersion,
    shouldDiscover,
    discoveryQuery.data,
    discoveryQuery.error,
    fallbackToStatic,
  ]);

  return {
    resolvedGVK,
    isDiscovering: shouldDiscover && discoveryQuery.isLoading,
    discoveryError: discoveryQuery.error,
    isDiscovered: resolvedGVK.isDiscovered ?? false,
  };
}
