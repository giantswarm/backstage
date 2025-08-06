import { useMemo } from 'react';
import { useListResources } from './useListResources';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';

export function useResources<R extends KubeObject<any>>(
  clusters: string | string[],
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): { apiVersion: string; group: string; plural: string };
  },
  queryOptions?: QueryOptions<KubeObjectInterface[]>,
) {
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];

  const clustersGVKs = Object.fromEntries(
    selectedClusters.map(c => [c, ResourceClass.getGVK()]),
  );

  const queriesInfo = useListResources<KubeObjectInterface>(
    selectedClusters,
    clustersGVKs,
    {},
    queryOptions,
  );

  const resources = useMemo(() => {
    return queriesInfo.clustersData.flatMap(({ cluster, data }) =>
      data.map(resource => new ResourceClass(resource, cluster)),
    );
  }, [queriesInfo.clustersData, ResourceClass]);

  return {
    ...queriesInfo,
    resources,
  };
}
