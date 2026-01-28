import { useMemo } from 'react';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';
import { useGetResource } from './useGetResource';
import { CustomResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';
import { ErrorInfo } from './utils/queries';
import { usePreferredVersion } from './useApiDiscovery';

export function useResource<R extends KubeObject<any>>(
  cluster: string,
  ResourceClass: (new (json: any, cluster: string) => R) & {
    getGVK(): CustomResourceMatcher;
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

  const { resolvedGVK, isDiscovering, discoveryError, isDiscovered } =
    usePreferredVersion(cluster, staticGVK, {
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
        (queryOptions?.enabled ?? true) && !isDiscovering && Boolean(cluster),
    },
  );

  const resource = useMemo(() => {
    if (!queryInfo.data) {
      return undefined;
    }

    return new ResourceClass(queryInfo.data, cluster);
  }, [queryInfo.data, cluster, ResourceClass]);

  const errors: ErrorInfo[] = useMemo(() => {
    if (!queryInfo.error) {
      return [];
    }
    return [
      {
        cluster,
        error: queryInfo.error,
        retry: queryInfo.refetch,
      },
    ];
  }, [cluster, queryInfo.error, queryInfo.refetch]);

  return {
    ...queryInfo,
    isLoading: isRestoring || isDiscovering || queryInfo.isLoading,
    resource,
    errors,
    resolvedApiVersion: resolvedGVK.apiVersion,
    isApiVersionDiscovered: isDiscovered,
    discoveryError,
  };
}
