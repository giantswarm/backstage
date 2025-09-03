import {
  Deployment,
  Namespace,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

function useFluxNamespaces(clusters: string | string[] | null) {
  const clustersArray = [clusters].flat().filter(Boolean) as string[];
  const clustersOptions = Object.fromEntries(
    clustersArray.map(cluster => [
      cluster,
      {
        labelSelector: {
          matchingLabels: {
            'app.kubernetes.io/part-of': 'flux',
          },
        },
      },
    ]),
  );

  const { resources: namespaces } = useResources(
    clustersArray,
    Namespace,
    clustersOptions,
    {
      enabled: clustersArray.length > 0,
    },
  );

  return { namespaces };
}

export function useFluxDeployments(clusters: string | string[] | null) {
  const clustersArray = [clusters].flat().filter(Boolean) as string[];

  const { namespaces } = useFluxNamespaces(clusters);

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
