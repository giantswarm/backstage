import { useMemo } from 'react';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';
import { useGetResource } from './useGetResource';

export function useResource<R extends KubeObject<any>>(
  cluster: string,
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): { apiVersion: string; group: string; plural: string };
  },
  options: {
    name: string;
    namespace?: string;
  },
  queryOptions?: QueryOptions<KubeObjectInterface>,
) {
  const clusterGVK = ResourceClass.getGVK();

  const queryInfo = useGetResource<KubeObjectInterface>(
    cluster,
    clusterGVK,
    options,
    queryOptions,
  );

  const resource = useMemo(() => {
    if (!queryInfo.data) {
      return undefined;
    }

    return new ResourceClass(queryInfo.data, cluster);
  }, [queryInfo.data, cluster, ResourceClass]);

  return {
    ...queryInfo,
    resource,
  };
}
