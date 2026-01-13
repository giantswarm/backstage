import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useHelmChartTagManifest } from './useHelmChartTagManifest';

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

export function useHelmChartValuesSchema(
  chartRef: string | undefined,
  chartTag: string | undefined,
) {
  const {
    tagManifest,
    error: tagManifestError,
    isLoading: isLoadingTagManifest,
  } = useHelmChartTagManifest(chartRef, chartTag);

  const schemaUrl =
    tagManifest?.annotations[VALUES_SCHEMA_ANNOTATION] ??
    tagManifest?.annotations[DEPRECATED_VALUES_SCHEMA_ANNOTATION];

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
