import { useMemo } from 'react';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { QueryOptions } from './types';
import { useGetResource } from './useGetResource';
import { MultiVersionResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { ErrorInfoUnion } from './utils/queries';
import { usePreferredVersion } from './useApiDiscovery';
import { useReportApiVersionIssues } from './useReportApiVersionIssues';

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
  // Without a name there is nothing to get: the path would be the list's, and
  // the list would be read as if it were one resource.
  const enabled = (queryOptions?.enabled ?? true) && Boolean(options.name);

  const {
    resolvedGVK,
    isDiscovering,
    discoveryErrors,
    incompatibilities,
    clientOutdatedStates,
  } = usePreferredVersion(cluster, staticGVK, {
    enableDiscovery: options.enableDiscovery,
    enabled,
    explicitVersion: options.apiVersion,
  });

  const queryInfo = useGetResource<KubeObjectInterface>(
    cluster,
    resolvedGVK ?? staticGVK,
    options,
    {
      ...queryOptions,
      enabled:
        enabled && !isDiscovering && Boolean(cluster) && Boolean(resolvedGVK),
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

    // Include incompatibility errors
    for (const incompatibility of incompatibilities) {
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
  }, [cluster, incompatibilities, queryInfo.error, queryInfo.refetch]);

  // Report API version issues to Sentry automatically. Not while disabled: the
  // issues then come from discovery another caller cached, and are reported
  // by whichever caller is actually reading the resource.
  useReportApiVersionIssues(
    enabled && incompatibilities.length > 0 ? incompatibilities : null,
    enabled && clientOutdatedStates.length > 0 ? clientOutdatedStates : null,
  );

  return {
    ...queryInfo,
    isLoading: isRestoring || isDiscovering || isAwaitingData(queryInfo),
    resource,
    errors,
    resolvedApiVersion: resolvedGVK?.apiVersion,
    discoveryErrors,
    incompatibilities,
    clientOutdatedStates,
  };
}
