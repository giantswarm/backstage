import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { containerRegistryApiRef } from '../../apis/containerRegistry';
import { parseChartRef } from '../utils/parseChartRef';

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

export function useHelmChartValuesYaml(
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
