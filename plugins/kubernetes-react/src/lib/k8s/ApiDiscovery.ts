import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from './CustomResourceMatcher';
import { VersionCompatibility } from './VersionTypes';

/**
 * Represents a specific version of an API group.
 * Returned by Kubernetes API discovery at /apis/{group}
 */
export interface APIGroupVersion {
  /** Full group/version string, e.g., "cluster.x-k8s.io/v1beta1" */
  groupVersion: string;
  /** Version only, e.g., "v1beta1" */
  version: string;
}

/**
 * Represents a Kubernetes API group with its available versions.
 * Returned by Kubernetes API discovery at /apis/{group}
 */
export interface APIGroup {
  /** The name of the group, e.g., "cluster.x-k8s.io" */
  name: string;
  /** All available versions for this group */
  versions: APIGroupVersion[];
  /** The server's preferred version for this group */
  preferredVersion: APIGroupVersion;
}

/**
 * Extended GVK that includes discovery metadata.
 * Used when resolving API versions dynamically.
 */
export interface ResolvedGVK extends CustomResourceMatcher {
  /** Whether the apiVersion was discovered from the cluster */
  isDiscovered?: boolean;
}

/**
 * Resolved GVK with multi-version support and compatibility information.
 */
export interface ResolvedGVKWithCompatibility
  extends MultiVersionResourceMatcher {
  /** Whether the apiVersion was discovered from the cluster */
  isDiscovered?: boolean;
  /** Version compatibility information, present when discovery is complete */
  compatibility?: VersionCompatibility;
}
