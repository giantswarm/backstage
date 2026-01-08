import { useMemo, useState } from 'react';
import { Content, Table, TableColumn } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { getHelmChartsFromEntity } from '../../utils/entity';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { QueryClientProvider } from '../../QueryClientProvider';
import { DateComponent } from '../../UI';

const useStyles = makeStyles(theme => ({
  latestChip: {
    margin: 0,
    marginLeft: theme.spacing(1),
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
  chartSelect: {
    minWidth: 300,
  },
}));

type ChartTagData = {
  tag: string;
  isLatest: boolean;
  createdAt: string | null;
};

type VersionHistoryTableProps = {
  chartRef: string;
  chartName: string;
};

const VersionHistoryTable = ({
  chartRef,
  chartName,
}: VersionHistoryTableProps) => {
  const classes = useStyles();
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(chartRef);

  const tableData: ChartTagData[] = useMemo(() => {
    if (!tags) {
      return [];
    }

    return tags.map(tagInfo => ({
      tag: tagInfo.tag,
      isLatest: tagInfo.tag === latestStableVersion,
      createdAt: tagInfo.createdAt,
    }));
  }, [tags, latestStableVersion]);

  const columns: TableColumn<ChartTagData>[] = useMemo(
    () => [
      {
        title: 'Tag',
        field: 'tag',
        render: (row: ChartTagData) => (
          <Box display="flex" alignItems="center">
            <Typography variant="body2">{row.tag}</Typography>
            {row.isLatest && (
              <Chip
                label="Latest"
                size="small"
                className={classes.latestChip}
              />
            )}
          </Box>
        ),
      },
      {
        title: 'Created',
        field: 'createdAt',
        type: 'datetime',
        render: (row: ChartTagData) => (
          <DateComponent value={row.createdAt} relative />
        ),
      },
    ],
    [classes.latestChip],
  );

  if (error) {
    return (
      <Typography color="error">
        Failed to load tags: {error.message}
      </Typography>
    );
  }

  return (
    <Table<ChartTagData>
      isLoading={isLoading}
      options={{
        pageSize: 50,
        pageSizeOptions: [10, 25, 50, 100],
        emptyRowsWhenPaging: false,
      }}
      data={tableData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">
          Tags for {chartName} ({tableData.length})
        </Typography>
      }
      columns={columns}
    />
  );
};

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
        <VersionHistoryTable
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
