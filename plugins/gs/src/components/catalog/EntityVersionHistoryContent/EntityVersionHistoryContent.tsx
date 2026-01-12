import { QueryClientProvider } from '../../QueryClientProvider';
import { ChartTagsTable } from './ChartTagsTable';
import {
  EntityChartProvider,
  useCurrentEntityChart,
} from '../EntityChartContext';

const VersionHistoryContent = () => {
  const { selectedChart } = useCurrentEntityChart();

  return (
    <ChartTagsTable
      chartRef={selectedChart.ref}
      chartName={selectedChart.name}
    />
  );
};

export const EntityVersionHistoryContent = () => {
  return (
    <QueryClientProvider>
      <EntityChartProvider>
        <VersionHistoryContent />
      </EntityChartProvider>
    </QueryClientProvider>
  );
};
