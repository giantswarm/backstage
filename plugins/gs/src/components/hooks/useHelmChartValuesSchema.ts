import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { gitHubApiRef } from '../../apis/github';
import { useHelmChartTagManifest } from './useHelmChartTagManifest';

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

export function useHelmChartValuesSchema(
  chartRef: string | undefined,
  chartTag: string | undefined,
) {
  const gitHubApi = useApi(gitHubApiRef);
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
        const content = await gitHubApi.fetchRawContent(schemaUrl);
        if (!content) {
          return null;
        }

        const rawSchema = JSON.parse(content);

        try {
          return await $RefParser.dereference(schemaUrl, rawSchema, {
            dereference: { circular: 'ignore' },
          });
        } catch (refErr) {
          // If external $ref resolution fails (e.g. CORS), return the raw schema
          // so that downstream consumers can still use the parts that don't need refs.
          // eslint-disable-next-line no-console
          console.warn(
            `Failed to resolve $ref references in schema from ${schemaUrl}:`,
            refErr,
          );
          return rawSchema;
        }
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
