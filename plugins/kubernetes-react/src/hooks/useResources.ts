import { useMemo } from 'react';
import { useListResources } from './useListResources';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { Options, QueryOptions } from './types';
import { MultiVersionResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';
import { usePreferredVersions } from './useApiDiscovery';
import { ErrorInfoUnion } from './utils/queries';

export interface UseResourcesQueryOptions<T> extends QueryOptions<T> {
  /** Enable API version discovery. Defaults to true. */
  enableDiscovery?: boolean;
}

export function useResources<R extends KubeObject<any>>(
  clusters: string | string[],
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): MultiVersionResourceMatcher;
  },
  options: Record<string, Options> = {},
  queryOptions: UseResourcesQueryOptions<KubeObjectInterface[]> = {},
) {
  const isRestoring = useIsRestoring();
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];
  const staticGVK = ResourceClass.getGVK();

  const { enableDiscovery, ...restQueryOptions } = queryOptions;

  const {
    clustersGVKs,
    isDiscovering,
    discoveryErrors,
    clustersQueryEnabled,
    incompatibilities,
  } = usePreferredVersions(selectedClusters, staticGVK, {
    enableDiscovery,
  });

  // Filter out clusters that are incompatible (queryEnabled = false)
  const compatibleClusters = useMemo(() => {
    return selectedClusters.filter(
      cluster => clustersQueryEnabled[cluster] !== false,
    );
  }, [selectedClusters, clustersQueryEnabled]);

  // Filter GVKs to only include compatible clusters
  const compatibleClustersGVKs = useMemo(() => {
    const result: Record<string, (typeof clustersGVKs)[string]> = {};
    for (const cluster of compatibleClusters) {
      if (clustersGVKs[cluster]) {
        result[cluster] = clustersGVKs[cluster];
      }
    }
    return result;
  }, [compatibleClusters, clustersGVKs]);

  const queriesInfo = useListResources<KubeObjectInterface>(
    compatibleClusters,
    compatibleClustersGVKs,
    options,
    {
      ...restQueryOptions,
      enabled: (restQueryOptions?.enabled ?? true) && !isDiscovering,
    },
  );

  const resources = useMemo(() => {
    return queriesInfo.clustersData.flatMap(({ cluster, data }) =>
      data.map(resource => new ResourceClass(resource, cluster)),
    );
  }, [queriesInfo.clustersData, ResourceClass]);

  const errors: ErrorInfoUnion[] = useMemo(() => {
    // Start with regular fetch errors (filtered)
    const fetchErrors = queriesInfo.errors.filter(
      ({ error }) => error.name !== 'RejectedError',
    );

    // Add incompatibility errors
    const incompatibilityErrors: ErrorInfoUnion[] = incompatibilities.map(
      incompatibility => ({
        type: 'incompatibility' as const,
        cluster: incompatibility.cluster,
        incompatibility,
      }),
    );

    return [...fetchErrors, ...incompatibilityErrors];
  }, [queriesInfo.errors, incompatibilities]);

  return {
    ...queriesInfo,
    isLoading: isRestoring || isDiscovering || queriesInfo.isLoading,
    resources,
    errors,
    discoveryErrors,
    incompatibilities,
    clustersQueryEnabled,
  };
}
