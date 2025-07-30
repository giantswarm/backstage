import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import type { List } from '@giantswarm/backstage-plugin-gs-common';
import { mapQueriesToClusters } from './utils/queries';
import { getK8sListPath } from './utils/k8sPath';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { QueryOptions } from './types';

export function useListResources<T>(
  clusters: string[],
  clustersGVKs: { [cluster: string]: CustomResourceMatcher },
  options: {
    namespace?: string;
  },
  queryOptions: QueryOptions<T[]> = {},
) {
  const kubernetesApi = useApi(kubernetesApiRef);

  return useQueries({
    queries: clusters.map(cluster => {
      const gvk = clustersGVKs[cluster];
      const path = getK8sListPath(gvk, options.namespace);
      return {
        queryKey: [cluster, 'list', gvk.plural],
        queryFn: async () => {
          const response = await kubernetesApi.proxy({
            clusterName: cluster,
            path,
          });

          if (!response.ok) {
            const error = new Error(
              `Failed to fetch resources from ${cluster} at ${path}. Reason: ${response.statusText}.`,
            );
            error.name =
              response.status === 403 ? 'ForbiddenError' : error.name;
            error.name = response.status === 404 ? 'NotFoundError' : error.name;

            throw error;
          }

          const list: List<T> = await response.json();

          return list.items;
        },
        ...queryOptions,
      };
    }),
    combine: results => mapQueriesToClusters(clusters, results),
  });
}
