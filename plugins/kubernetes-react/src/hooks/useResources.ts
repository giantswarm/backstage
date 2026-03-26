import { useMemo } from 'react';
import { useListResources } from './useListResources';
import { KubeObject, KubeObjectInterface } from '../lib/k8s/KubeObject';
import { Options, QueryOptions } from './types';
import { MultiVersionResourceMatcher } from '../lib/k8s/CustomResourceMatcher';
import { useIsRestoring } from '@tanstack/react-query';
import { usePreferredVersions } from './useApiDiscovery';
import { ErrorInfo, ErrorInfoUnion } from './utils/queries';
import { useReportApiVersionIssues } from './useReportApiVersionIssues';

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
    incompatibilities,
    clientOutdatedStates,
  } = usePreferredVersions(selectedClusters, staticGVK, {
    enableDiscovery,
  });

  const queriesInfo = useListResources<KubeObjectInterface>(
    Object.keys(clustersGVKs),
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

  const errors: ErrorInfoUnion[] = useMemo(() => {
    const isNotRejected = ({ error }: ErrorInfo) =>
      error.name !== 'RejectedError';

    // Add incompatibility errors
    const incompatibilityErrors: ErrorInfoUnion[] = incompatibilities.map(
      incompatibility => ({
        type: 'incompatibility' as const,
        cluster: incompatibility.cluster,
        incompatibility,
      }),
    );

    return [
      ...discoveryErrors.filter(isNotRejected),
      ...queriesInfo.errors.filter(isNotRejected),
      ...incompatibilityErrors,
    ];
  }, [queriesInfo.errors, incompatibilities, discoveryErrors]);

  // Report API version issues to Sentry automatically
  useReportApiVersionIssues(
    incompatibilities.length > 0 ? incompatibilities : null,
    clientOutdatedStates.length > 0 ? clientOutdatedStates : null,
  );

  return {
    ...queriesInfo,
    isLoading: isRestoring || isDiscovering || queriesInfo.isLoading,
    resources,
    errors,
  };
}
