import { useMemo } from 'react';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';
import { useGetResource } from './useGetResource';
import { MultiVersionResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';
import { ErrorInfoUnion } from './utils/queries';
import { usePreferredVersion } from './useApiDiscovery';

export function useResource<R extends KubeObject<any>>(
  cluster: string,
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): MultiVersionResourceMatcher;
  },
  options: {
    name: string;
    namespace?: string;
    apiVersion?: string;
    enableDiscovery?: boolean;
  },
  queryOptions?: QueryOptions<KubeObjectInterface>,
) {
  const isRestoring = useIsRestoring();
  const staticGVK = ResourceClass.getGVK();

  const {
    resolvedGVK,
    isDiscovering,
    discoveryError,
    isDiscovered,
    queryEnabled,
    incompatibility,
  } = usePreferredVersion(cluster, staticGVK, {
    enableDiscovery: options.enableDiscovery,
    explicitVersion: options.apiVersion,
  });

  const queryInfo = useGetResource<KubeObjectInterface>(
    cluster,
    resolvedGVK,
    options,
    {
      ...queryOptions,
      enabled:
        (queryOptions?.enabled ?? true) &&
        !isDiscovering &&
        Boolean(cluster) &&
        queryEnabled,
    },
  );

  const resource = useMemo(() => {
    if (!queryInfo.data) {
      return undefined;
    }

    return new ResourceClass(queryInfo.data, cluster);
  }, [queryInfo.data, cluster, ResourceClass]);

  const errors: ErrorInfoUnion[] = useMemo(() => {
    const result: ErrorInfoUnion[] = [];

    // Include incompatibility as an error
    if (incompatibility) {
      result.push({
        type: 'incompatibility',
        cluster,
        incompatibility,
      });
    }

    // Include regular fetch errors
    if (queryInfo.error) {
      result.push({
        type: 'error',
        cluster,
        error: queryInfo.error,
        retry: queryInfo.refetch,
      });
    }

    return result;
  }, [cluster, incompatibility, queryInfo.error, queryInfo.refetch]);

  return {
    ...queryInfo,
    isLoading: isRestoring || isDiscovering || queryInfo.isLoading,
    resource,
    errors,
    resolvedApiVersion: resolvedGVK.apiVersion,
    isApiVersionDiscovered: isDiscovered,
    discoveryError,
    incompatibility,
    compatibility: resolvedGVK.compatibility,
  };
}
