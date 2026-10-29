import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { useMemo } from 'react';
import { containerRegistryApiRef } from '../../apis/containerRegistry';
import { parseChartRef } from '@giantswarm/backstage-plugin-gs-common';

export function useHelmChartTagManifest(
  chartRef: string | undefined,
  chartTag: string | undefined,
) {
  const containerRegistryApi = useApi(containerRegistryApiRef);

  const { registry, repository } = useMemo(() => {
    if (!chartRef) {
      return { registry: undefined, repository: undefined };
    }

    const parsed = parseChartRef(chartRef);
    return { registry: parsed.registry, repository: parsed.repository };
  }, [chartRef]);

  const {
    data: tagManifest,
    error,
    isPending,
    fetchStatus,
  } = useQuery({
    queryKey: ['oci-tag-manifest', registry, repository, chartTag],
    queryFn: () => {
      if (!registry || !repository || !chartTag) {
        return undefined;
      }

      return containerRegistryApi.getTagManifest(
        registry,
        repository,
        chartTag,
      );
    },
    enabled: Boolean(registry && repository && chartTag),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return useMemo(
    () => ({
      tagManifest,
      isLoading,
      error,
    }),
    [tagManifest, isLoading, error],
  );
}
