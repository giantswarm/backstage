import { useMemo } from 'react';
import { QueryOptions, useListResources } from './useListResources';
import {
  Kustomization,
  KustomizationInterface,
} from '../lib/k8s/Kustomization';

export function useKustomizations(
  clusters: string | string[],
  options?: QueryOptions,
) {
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];

  const clustersGVKs = Object.fromEntries(
    selectedClusters.map(c => [c, Kustomization.getGVK()]),
  );

  const queriesInfo = useListResources<KustomizationInterface>(
    selectedClusters,
    clustersGVKs,
    undefined,
    options,
  );

  const resources = useMemo(() => {
    return queriesInfo.clustersData.flatMap(({ cluster, data }) =>
      data.map(resource => new Kustomization(resource, cluster)),
    );
  }, [queriesInfo.clustersData]);

  return {
    ...queriesInfo,
    resources,
  };
}
