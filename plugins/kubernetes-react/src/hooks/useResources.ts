import { useMemo } from 'react';
import { QueryOptions, useListResources } from './useListResources';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';

export function useResources<R extends KubeObject<any>>(
  clusters: string | string[],
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): { apiVersion: string; group: string; plural: string };
  },
  options?: QueryOptions,
) {
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];

  const clustersGVKs = Object.fromEntries(
    selectedClusters.map(c => [c, ResourceClass.getGVK()]),
  );

  const queriesInfo = useListResources<KubeObjectInterface>(
    selectedClusters,
    clustersGVKs,
    undefined,
    options,
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
