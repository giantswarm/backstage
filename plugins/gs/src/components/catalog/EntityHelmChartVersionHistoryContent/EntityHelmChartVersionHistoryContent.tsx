import { QueryClientProvider } from '../../QueryClientProvider';
import {
  EntityChartProvider,
  useCurrentEntityChart,
} from '../EntityChartContext';
import { OciTagsTable } from '../OciTagsTable';

const HelmChartVersionHistoryContent = () => {
  const { selectedChart } = useCurrentEntityChart();

  return (
    <OciTagsTable ociRepository={selectedChart.ref} name={selectedChart.name} />
  );
};

export const EntityHelmChartVersionHistoryContent = () => {
  return (
    <QueryClientProvider>
      <EntityChartProvider>
        <HelmChartVersionHistoryContent />
      </EntityChartProvider>
    </QueryClientProvider>
  );
};
