import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useHelmChartTagManifest } from './useHelmChartTagManifest';

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

export function useHelmChartValuesYaml(
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

  const valuesYamlUrl = schemaUrl
    ? schemaUrl.replace('values.schema.json', 'values.yaml')
    : undefined;

  const {
    data: valuesYaml,
    error: valuesYamlError,
    isLoading: isLoadingValuesYaml,
  } = useQuery({
    queryKey: ['values-yaml', valuesYamlUrl],
    queryFn: async () => {
      if (!valuesYamlUrl) {
        return null;
      }

      try {
        const response = await fetch(valuesYamlUrl);
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to load values.yaml from ${valuesYamlUrl}`);
          return null;
        }

        return response.text();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Error loading values.yaml from ${valuesYamlUrl}:`, err);
        return null;
      }
    },
    enabled: Boolean(valuesYamlUrl),
  });

  const isLoading = isLoadingTagManifest || isLoadingValuesYaml;
  const error = tagManifestError || valuesYamlError;

  return useMemo(
    () => ({
      valuesYaml,
      isLoading,
      error,
    }),
    [valuesYaml, isLoading, error],
  );
}
