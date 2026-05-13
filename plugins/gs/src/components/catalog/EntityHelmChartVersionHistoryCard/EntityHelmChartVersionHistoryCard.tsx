import { QueryClientProvider } from '../../QueryClientProvider';
import { useCurrentEntityChart } from '../EntityChartContext';
import { OciTagsListCard } from '../OciTagsListCard';

const HelmChartVersionHistoryCardContent = () => {
  const { selectedChart } = useCurrentEntityChart();

  return <OciTagsListCard ociRepository={selectedChart.ref} />;
};

export const EntityHelmChartVersionHistoryCard = () => {
  return (
    <QueryClientProvider>
      <HelmChartVersionHistoryCardContent />
    </QueryClientProvider>
  );
};
