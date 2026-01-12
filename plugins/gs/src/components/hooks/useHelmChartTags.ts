import { useApi } from '@backstage/core-plugin-api';
import { useIsRestoring, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { containerRegistryApiRef } from '../../apis/containerRegistry';
import { parseChartRef } from '../utils/parseChartRef';

export function useHelmChartTags(chartRef: string | undefined) {
  const isRestoring = useIsRestoring();
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

  const { tags, latestStableVersion } = data ?? {};

  return useMemo(
    () => ({
      tags,
      latestStableVersion,
      isLoading: isRestoring || isLoading,
      error,
    }),
    [tags, latestStableVersion, isRestoring, isLoading, error],
  );
}
