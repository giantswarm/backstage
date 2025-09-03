import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import type { List } from '@giantswarm/backstage-plugin-gs-common';
import { mapQueriesToClusters } from './utils/queries';
import { getK8sListNamespacesPath } from './utils/k8sPath';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';
import * as k8sUrl from './utils/k8sUrl';
import { Namespace } from '../lib';

export function useNamespaces(
  clusters: string | string[],
  options: {
    labelSelector?: k8sUrl.IK8sLabelSelector;
  },
  queryOptions?: QueryOptions<KubeObjectInterface[]>,
) {
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];

  const kubernetesApi = useApi(kubernetesApiRef);

  const queriesInfo = useQueries({
    queries: selectedClusters.map(cluster => {
      const path = getK8sListNamespacesPath({
        labelSelector: options.labelSelector,
      });
      return {
        queryKey: [cluster, 'list', 'namespaces'],
        queryFn: async () => {
          const response = await kubernetesApi.proxy({
            clusterName: cluster,
            path,
          });

          if (!response.ok) {
            const error = new Error(
              `Failed to fetch namespaces from ${cluster} at ${path}. Reason: ${response.statusText}.`,
            );
            error.name =
              response.status === 403 ? 'ForbiddenError' : error.name;
            error.name = response.status === 404 ? 'NotFoundError' : error.name;

            throw error;
          }

          const list = await response.json();

          return list.items;
        },
        ...queryOptions,
      };
    }),
    combine: results => mapQueriesToClusters(selectedClusters, results),
  });

  const namespaces = useMemo(() => {
    return queriesInfo.clustersData.flatMap(({ cluster, data }) =>
      data.map(namespace => new Namespace(namespace, cluster)),
    );
  }, [queriesInfo.clustersData]);

  return {
    ...queriesInfo,
    namespaces,
  };
}
