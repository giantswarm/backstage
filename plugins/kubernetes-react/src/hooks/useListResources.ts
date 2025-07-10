import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import type { List } from '@giantswarm/backstage-plugin-gs-common';
import { mapQueriesToClusters } from './utils/queries';
import { getK8sListPath } from './utils/k8sPath';
// import { CustomResourceMatcher } from '../../apis/kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';

export function useListResources<T>(
  clusters: string[],
  installationsGVKs: { [installationName: string]: CustomResourceMatcher },
  namespace?: string,
) {
  const kubernetesApi = useApi(kubernetesApiRef);

  return useQueries({
    queries: clusters.map(installationName => {
      const gvk = installationsGVKs[installationName];
      const path = getK8sListPath(gvk, namespace);
      return {
        queryKey: [installationName, gvk.plural],
        queryFn: async () => {
          const response = await kubernetesApi.proxy({
            clusterName: installationName,
            path,
          });

          if (!response.ok) {
            const error = new Error(
              `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
            );
            error.name =
              response.status === 403 ? 'ForbiddenError' : error.name;
            error.name = response.status === 404 ? 'NotFoundError' : error.name;

            throw error;
          }

          const list: List<T> = await response.json();

          return list.items;
        },
      };
    }),
    combine: results => mapQueriesToClusters(clusters, results),
  });
}
