import { useMemo } from 'react';
import { useListResources } from './useListResources';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { Options, QueryOptions } from './types';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';
import { usePreferredVersions } from './useApiDiscovery';

export interface UseResourcesQueryOptions<T> extends QueryOptions<T> {
  /** Enable API version discovery. Defaults to true. */
  enableDiscovery?: boolean;
}

export function useResources<R extends KubeObject<any>>(
  clusters: string | string[],
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): CustomResourceMatcher;
  },
  options: Record<string, Options> = {},
  queryOptions: UseResourcesQueryOptions<KubeObjectInterface[]> = {},
) {
  const isRestoring = useIsRestoring();
  const selectedClusters = [clusters].flat().filter(Boolean) as string[];
  const staticGVK = ResourceClass.getGVK();

  const { enableDiscovery, ...restQueryOptions } = queryOptions;

  const { clustersGVKs, isDiscovering, discoveryErrors } = usePreferredVersions(
    selectedClusters,
    staticGVK,
    {
      enableDiscovery,
    },
  );

  const queriesInfo = useListResources<KubeObjectInterface>(
    selectedClusters,
    clustersGVKs,
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

  const errors = useMemo(() => {
    return queriesInfo.errors.filter(
      ({ error }) => error.name !== 'RejectedError',
    );
  }, [queriesInfo.errors]);

  return {
    ...queriesInfo,
    isLoading: isRestoring || isDiscovering || queriesInfo.isLoading,
    resources,
    errors,
    discoveryErrors,
  };
}
