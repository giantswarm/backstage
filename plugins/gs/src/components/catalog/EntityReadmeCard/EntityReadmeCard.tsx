import { Text } from '@backstage/ui';
import { useCurrentEntityChart } from '../EntityChartContext';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { useHelmChartReadme } from '../../hooks/useHelmChartReadme';
import { QueryClientProvider } from '../../QueryClientProvider';
import { parseChartRef } from '@giantswarm/backstage-plugin-gs-common';
import { CollapsibleMarkdownCard } from '../../UI';

const ReadmeCardContent = () => {
  const { selectedChart } = useCurrentEntityChart();
  const {
    latestStableVersion,
    isLoading: isLoadingTags,
    error: tagsError,
  } = useHelmChartTags(selectedChart.ref);
  const {
    readme,
    readmeUrl,
    isLoading: isLoadingReadme,
    error: readmeError,
  } = useHelmChartReadme(selectedChart.ref, latestStableVersion ?? undefined);

  const renderError = (error: Error) => {
    if (error.name === 'NotFoundError') {
      const { repository } = parseChartRef(selectedChart.ref);
      return (
        <Text color="secondary">
          The repository <code>{repository}</code> is not available in the
          registry.
        </Text>
      );
    }
    return undefined;
  };

  return (
    <CollapsibleMarkdownCard
      title="README"
      content={readme}
      sourceUrl={readmeUrl}
      isLoading={isLoadingTags || isLoadingReadme}
      error={tagsError || readmeError}
      emptyMessage="No README available."
      toggleLabels={{ expand: 'Show full README', collapse: 'Show less' }}
      renderError={renderError}
    />
  );
};

export const EntityReadmeCard = () => {
  return (
    <QueryClientProvider>
      <ReadmeCardContent />
    </QueryClientProvider>
  );
};
