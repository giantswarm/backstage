import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { gitHubApiRef } from '../../apis/github';
import { fetchContent } from './utils/fetchContent';
import { useHelmChartTagManifest } from './useHelmChartTagManifest';

const README_ANNOTATION = 'io.giantswarm.application.readme';

export function useHelmChartReadme(
  chartRef: string | undefined,
  chartTag: string | undefined,
) {
  const gitHubApi = useApi(gitHubApiRef);
  const {
    tagManifest,
    error: tagManifestError,
    isLoading: isLoadingTagManifest,
  } = useHelmChartTagManifest(chartRef, chartTag);

  const readmeUrl = tagManifest?.annotations[README_ANNOTATION];

  const {
    data: readme,
    error: readmeError,
    isLoading: isLoadingReadme,
  } = useQuery({
    queryKey: ['readme', readmeUrl],
    queryFn: async () => {
      if (!readmeUrl) {
        return null;
      }

      try {
        return await fetchContent(readmeUrl, gitHubApi);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Error loading readme from ${readmeUrl}:`, err);
        return null;
      }
    },
    enabled: Boolean(readmeUrl),
  });

  const isLoading = isLoadingTagManifest || isLoadingReadme;
  const error = tagManifestError || readmeError;

  return useMemo(
    () => ({
      readme,
      isLoading,
      error,
    }),
    [readme, isLoading, error],
  );
}
