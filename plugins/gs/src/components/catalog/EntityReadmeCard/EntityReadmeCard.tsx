import { Typography } from '@material-ui/core';
import { useCurrentEntityChart } from '../EntityChartContext';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { useHelmChartReadme } from '../../hooks/useHelmChartReadme';
import { QueryClientProvider } from '../../QueryClientProvider';
import { parseChartRef } from '../../utils/parseChartRef';
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
    isLoading: isLoadingReadme,
    error: readmeError,
  } = useHelmChartReadme(selectedChart.ref, latestStableVersion ?? undefined);

  const renderError = (error: Error) => {
    if (error.name === 'NotFoundError') {
      const { repository } = parseChartRef(selectedChart.ref);
      return (
        <Typography variant="inherit" color="textSecondary">
          The repository <code>{repository}</code> is not available in the
          registry.
        </Typography>
      );
    }
    return undefined;
  };

  return (
    <CollapsibleMarkdownCard
      title="README"
      content={readme}
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
