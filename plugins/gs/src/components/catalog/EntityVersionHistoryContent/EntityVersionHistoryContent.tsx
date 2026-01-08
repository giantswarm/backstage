import { useMemo, useState } from 'react';
import { Content } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { getHelmChartsFromEntity } from '../../utils/entity';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ChartTagsTable } from './ChartTagsTable';

const useStyles = makeStyles({
  chartSelect: {
    minWidth: 300,
  },
});

const VersionHistoryContent = () => {
  const classes = useStyles();
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
          <FormControl variant="outlined" className={classes.chartSelect}>
            <InputLabel id="chart-select-label">Chart</InputLabel>
            <Select
              labelId="chart-select-label"
              id="chart-select"
              value={selectedChartRef}
              onChange={e => setSelectedChartRef(e.target.value as string)}
              label="Chart"
            >
              {charts.map(chart => (
                <MenuItem key={chart.ref} value={chart.ref}>
                  {chart.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
      <Content>
        <VersionHistoryContent />
      </Content>
    </QueryClientProvider>
  );
};
