import {
  Deployment,
  useNamespaces,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function useFluxDeployments(clusters: string | string[] | null) {
  const clustersArray = [clusters].flat().filter(Boolean) as string[];

  const { namespaces } = useNamespaces(
    clustersArray,
    {
      labelSelector: {
        matchingLabels: {
          'app.kubernetes.io/part-of': 'flux',
        },
      },
    },
    {
      enabled: clustersArray.length > 0,
    },
  );

  const clustersOptions = Object.fromEntries(
    clustersArray.map(cluster => [
      cluster,
      {
        namespace: namespaces
          .find(namespace => namespace.cluster === cluster)
          ?.getName(),
      },
    ]),
  );

  return useResources(clustersArray, Deployment, clustersOptions, {
    enabled: clustersArray.length > 0 && namespaces.length > 0,
  });
}
