import { useMemo } from 'react';
import { useListResources } from './useListResources';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { Options, QueryOptions } from './types';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';

export function useResources<R extends KubeObject<any>>(
  clusters: string | string[],
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): CustomResourceMatcher;
  },
  options: Record<string, Options> = {},
  queryOptions: QueryOptions<KubeObjectInterface[]> = {},
) {
  const isRestoring = useIsRestoring();
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];

  const clustersGVKs = Object.fromEntries(
    selectedClusters.map(c => [c, ResourceClass.getGVK()]),
  );

  const queriesInfo = useListResources<KubeObjectInterface>(
    selectedClusters,
    clustersGVKs,
    options,
    queryOptions,
  );

  const resources = useMemo(() => {
    return queriesInfo.clustersData.flatMap(({ cluster, data }) =>
      data.map(resource => new ResourceClass(resource, cluster)),
    );
  }, [queriesInfo.clustersData, ResourceClass]);

  return {
    ...queriesInfo,
    isLoading: isRestoring || queriesInfo.isLoading,
    resources,
  };
}
