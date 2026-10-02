import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import { getK8sGetPath } from './utils/k8sPath';
import { k8sResponseError } from './utils/k8sResponseError';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { QueryOptions } from './types';

export function useGetResource<T>(
  cluster: string,
  gvk: CustomResourceMatcher,
  options: {
    name: string;
    namespace?: string;
  },
  queryOptions: QueryOptions<T> = {},
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const path = getK8sGetPath(gvk, options.name, options.namespace);

  const queryKey = [
    'cluster',
    cluster,
    'get',
    gvk.group,
    gvk.apiVersion,
    gvk.plural,
    options.namespace,
    options.name,
  ].filter(Boolean) as string[];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await kubernetesApi.proxy({
        clusterName: cluster,
        path,
      });

      if (!response.ok) {
        throw await k8sResponseError(
          response,
          `Failed to fetch resources from ${cluster} at ${path}`,
        );
      }

      const app: T = await response.json();

      return app;
    },
    ...queryOptions,
  });
}
