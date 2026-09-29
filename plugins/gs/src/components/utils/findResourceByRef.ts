import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';

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
    const nameMatch = resource.getName() === name;
    const resourceNamespace = resource.getNamespace();
    const namespaceMatch =
      !namespace || // ref doesn't specify namespace
      !resourceNamespace || // resource is cluster-scoped
      resourceNamespace === namespace; // both have namespaces, must match

    // Matches by API group only, ignoring the version suffix, so a ref that
    // says v1beta1 still finds a resource fetched at v1beta2.
    const apiGroupMatch = resource.matchesRef({ apiVersion, apiGroup, kind });

    return (
      installationNameMatch && apiGroupMatch && nameMatch && namespaceMatch
    );
  });

  return r ?? null;
}
