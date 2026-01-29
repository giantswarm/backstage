import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Extracts the API group from an apiVersion string.
 * For "controlplane.cluster.x-k8s.io/v1beta1" returns "controlplane.cluster.x-k8s.io"
 * For core resources like "v1" returns undefined
 */
function getApiGroupFromVersion(
  apiVersion: string | undefined,
): string | undefined {
  if (!apiVersion) return undefined;
  const parts = apiVersion.split('/');
  return parts.length === 2 ? parts[0] : undefined;
}

export function findResourceByRef<T extends KubeObject>(
  resources: T[],
  ref: {
    installationName: string;
    // ObjectReference format: apiVersion includes version (e.g., "cluster.x-k8s.io/v1beta1")
    apiVersion?: string;
    // TypedLocalObjectReference format: apiGroup without version (e.g., "cluster.x-k8s.io")
    apiGroup?: string;
    kind?: string;
    name?: string;
    namespace?: string;
  },
) {
  const { installationName, apiVersion, apiGroup, kind, name, namespace } = ref;

  // kind and name are required for meaningful lookup
  if (!kind || !name) {
    return null;
  }

  const r = resources.find(resource => {
    const installationNameMatch = resource.cluster === installationName;
    const kindMatch = resource.getKind() === kind;
    const nameMatch = resource.getName() === name;
    const resourceNamespace = resource.getNamespace();
    const namespaceMatch =
      !namespace || // ref doesn't specify namespace
      !resourceNamespace || // resource is cluster-scoped
      resourceNamespace === namespace; // both have namespaces, must match

    // API group matching: supports both ObjectReference (apiVersion) and
    // TypedLocalObjectReference (apiGroup) formats.
    // Matches by group only, ignoring version suffix to handle cases where
    // the ref specifies v1beta1 but resources were fetched with v1beta2.
    let apiGroupMatch = true;
    const resourceGroup = getApiGroupFromVersion(resource.getApiVersion());

    if (apiGroup) {
      // TypedLocalObjectReference format: apiGroup provided directly
      if (resourceGroup) {
        apiGroupMatch = apiGroup === resourceGroup;
      } else {
        // Resource is a core resource (no group), but ref has apiGroup - no match
        apiGroupMatch = false;
      }
    } else if (apiVersion) {
      // ObjectReference format: extract group from apiVersion
      const refGroup = getApiGroupFromVersion(apiVersion);

      if (refGroup && resourceGroup) {
        // Both have groups: match by group only
        apiGroupMatch = refGroup === resourceGroup;
      } else if (!refGroup && !resourceGroup) {
        // Both are core resources: exact version match
        apiGroupMatch = resource.getApiVersion() === apiVersion;
      } else {
        // One has group, other doesn't - no match
        apiGroupMatch = false;
      }
    }

    return (
      installationNameMatch &&
      apiGroupMatch &&
      kindMatch &&
      nameMatch &&
      namespaceMatch
    );
  });

  return r ?? null;
}
