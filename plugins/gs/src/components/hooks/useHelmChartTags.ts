import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { containerRegistryApiRef } from '../../apis/containerRegistry';
import { parseChartRef } from '../utils/parseChartRef';

export function useHelmChartTags(chartRef: string | undefined) {
  const containerRegistryApi = useApi(containerRegistryApiRef);

  const { registry, repository } = useMemo(() => {
    if (!chartRef) {
      return { registry: undefined, repository: undefined };
    }

    const parsed = parseChartRef(chartRef);
    return { registry: parsed.registry, repository: parsed.repository };
  }, [chartRef]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['oci-tags', registry, repository],
    queryFn: () => {
      return containerRegistryApi.getTags(registry!, repository!);
    },
    enabled: Boolean(registry && repository),
  });

  return useMemo(
    () => ({
      tags: data?.tags,
      latestStableVersion: data?.latestStableVersion,
      isLoading,
      error,
    }),
    [data, isLoading, error],
  );
}
