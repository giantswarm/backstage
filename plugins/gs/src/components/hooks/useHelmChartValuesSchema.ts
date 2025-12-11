import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { containerRegistryApiRef } from '../../apis/containerRegistry';
import { parseChartRef } from '../utils/parseChartRef';

const VALUES_SCHEMA_ANNOTATION = 'application.giantswarm.io/values-schema';

export function useHelmChartValuesSchema(
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
    error: tagManifestError,
    isLoading: isLoadingTagManifest,
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

  const schemaUrl = tagManifest?.annotations[VALUES_SCHEMA_ANNOTATION];

  const {
    data: schema,
    error: schemaError,
    isLoading: isLoadingSchema,
  } = useQuery({
    queryKey: ['schema', schemaUrl],
    queryFn: async () => {
      if (!schemaUrl) {
        return null;
      }

      try {
        const response = await fetch(schemaUrl);
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to load schema from ${schemaUrl}`);
          return null;
        }

        return response.json();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Error loading schema from ${schemaUrl}:`, err);
        return null;
      }
    },
    enabled: Boolean(schemaUrl),
  });

  const isLoading = isLoadingTagManifest || isLoadingSchema;
  const error = tagManifestError || schemaError;

  return useMemo(
    () => ({
      schema,
      isLoading,
      error,
    }),
    [schema, isLoading, error],
  );
}
