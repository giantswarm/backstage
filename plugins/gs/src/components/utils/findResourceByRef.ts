import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';

export function findResourceByRef<T extends KubeObject>(
  resources: T[],
  ref: {
    installationName: string;
    apiVersion?: string;
    kind: string;
    name: string;
    namespace?: string;
  },
) {
  const { installationName, apiVersion, kind, name, namespace } = ref;
  const r = resources.find(resource => {
    const installationNameMatch = resource.cluster === installationName;
    const apiVersionMatch = apiVersion
      ? resource.getApiVersion() === apiVersion
      : true;
    const kindMatch = resource.getKind() === kind;
    const nameMatch = resource.getName() === name;
    const namespaceMatch = namespace
      ? resource.getNamespace() === namespace
      : true;

    return (
      installationNameMatch &&
      apiVersionMatch &&
      kindMatch &&
      nameMatch &&
      namespaceMatch
    );
  });

  return r ?? null;
}
