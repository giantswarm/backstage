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
 * Represents a single API resource within a version.
 * Returned by Kubernetes API discovery at /apis/{group}/{version}
 */
export interface APIResource {
  /** Plural name of the resource, e.g., "gitrepositories" */
  name: string;
  /** Singular name, e.g., "gitrepository" */
  singularName: string;
  /** Whether the resource is namespaced */
  namespaced: boolean;
  /** Kind name, e.g., "GitRepository" */
  kind: string;
  /** Supported verbs like ["get", "list", "create", ...] */
  verbs: string[];
}

/**
 * Represents the list of resources available at a specific API version.
 * Returned by Kubernetes API discovery at /apis/{group}/{version}
 */
export interface APIResourceList {
  /** Full group/version string */
  groupVersion: string;
  /** List of available resources at this version */
  resources: APIResource[];
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
export interface ResolvedGVKWithCompatibility extends MultiVersionResourceMatcher {
  /** Whether the apiVersion was discovered from the cluster */
  isDiscovered?: boolean;
  /** Version compatibility information, present when discovery is complete */
  compatibility?: VersionCompatibility;
}
