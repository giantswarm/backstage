import { useMemo } from 'react';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';
import { useGetResource } from './useGetResource';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';

export function useResource<R extends KubeObject<any>>(
  cluster: string,
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): CustomResourceMatcher;
  },
  options: {
    name: string;
    namespace?: string;
  },
  queryOptions?: QueryOptions<KubeObjectInterface>,
) {
  const isRestoring = useIsRestoring();
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
    isLoading: isRestoring || queryInfo.isLoading,
    resource,
  };
}
