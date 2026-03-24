import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from '../../lib/k8s/CustomResourceMatcher';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../../lib/k8s/VersionTypes';
import { ErrorInfo } from '../utils/queries';
import { usePreferredVersions } from './usePreferredVersions';

export interface UsePreferredVersionOptions {
  /** Enable API version discovery. Defaults to true. */
  enableDiscovery?: boolean;
  /** Explicit API version to use, bypasses discovery. */
  explicitVersion?: string;
  /** Fall back to static version on discovery error. Defaults to true. */
  fallbackToStatic?: boolean;
}

export interface UsePreferredVersionResult {
  /** The resolved GVK with the discovered or static apiVersion, undefined if incompatible */
  resolvedGVK: CustomResourceMatcher | undefined;
  /** Whether discovery is in progress */
  isDiscovering: boolean;
  /** Discovery errors */
  discoveryErrors: ErrorInfo[];
  /** Incompatibility states when versions don't match */
  incompatibilities: IncompatibilityState[];
  /** Client outdated states when server has newer versions */
  clientOutdatedStates: ClientOutdatedState[];
}

/**
 * Hook to resolve the preferred API version for a single cluster.
 * Delegates to usePreferredVersions with a single-element cluster array.
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
  const { enableDiscovery, explicitVersion, fallbackToStatic } = options;

  const clusters = cluster ? [cluster] : [];

  const {
    clustersGVKs,
    isDiscovering,
    discoveryErrors,
    incompatibilities,
    clientOutdatedStates,
  } = usePreferredVersions(clusters, gvk, {
    enableDiscovery,
    explicitVersion,
    fallbackToStatic,
  });

  return {
    resolvedGVK: clustersGVKs[cluster],
    isDiscovering,
    discoveryErrors,
    incompatibilities,
    clientOutdatedStates,
  };
}
