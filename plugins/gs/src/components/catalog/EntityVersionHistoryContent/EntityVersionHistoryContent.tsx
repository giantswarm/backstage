import { useMemo, useState } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { getHelmChartsFromEntity } from '../../utils/entity';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ChartTagsTable } from './ChartTagsTable';
import { ChartSelector } from './ChartSelector';

const VersionHistoryContent = () => {
  const { entity } = useEntity();
  const charts = getHelmChartsFromEntity(entity);

  const [selectedChartRef, setSelectedChartRef] = useState<string>(
    charts[0]?.ref ?? '',
  );

  const selectedChart = useMemo(
    () => charts.find(chart => chart.ref === selectedChartRef) ?? charts[0],
    [charts, selectedChartRef],
  );

  const showChartSelector = charts.length > 1;

  if (charts.length === 0) {
    return (
      <Typography>
        No helm charts configured for this entity. Add the{' '}
        <code>giantswarm.io/helmcharts</code> annotation to configure charts.
      </Typography>
    );
  }

  return (
    <>
      {showChartSelector && (
        <Box mb={2}>
          <ChartSelector
            charts={charts}
            selectedChartRef={selectedChartRef}
            onChartChange={setSelectedChartRef}
          />
        </Box>
      )}
      {selectedChart && (
        <ChartTagsTable
          chartRef={selectedChart.ref}
          chartName={selectedChart.name}
        />
      )}
    </>
  );
};

export const EntityVersionHistoryContent = () => {
  return (
    <QueryClientProvider>
      <VersionHistoryContent />
    </QueryClientProvider>
  );
};
