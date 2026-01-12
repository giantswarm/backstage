import { useMemo } from 'react';
import { Chart } from '../EntityChartContext';
import {
  Box,
  makeStyles,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  tab: {
    padding: theme.spacing(2, 4),
    lineHeight: 1.4,
  },
  label: {
    marginRight: theme.spacing(3),
    marginLeft: theme.spacing(3),
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
}));

type ChartSelectorProps = {
  charts: Chart[];
  selectedChartRef: string;
  onChartChange: (chartRef: string) => void;
};

export const ChartSelector = ({
  charts,
  selectedChartRef,
  onChartChange,
}: ChartSelectorProps) => {
  const classes = useStyles();

  const items = useMemo(
    () =>
      charts.map(chart => ({
        label: chart.name,
        value: chart.ref,
      })),
    [charts],
  );

  const handleChange = (_event: React.ChangeEvent<{}>, newValue: string) => {
    if (newValue) {
      onChartChange(newValue);
    }
  };

  return (
    <Paper square>
      <Box display="flex" alignItems="center">
        <Typography variant="overline" className={classes.label}>
          Helm Charts
        </Typography>
        <Tabs
          value={selectedChartRef}
          indicatorColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          onChange={handleChange}
          aria-label="Helm charts selector"
        >
          {items.map(({ label, value }) => (
            <Tab
              key={value}
              label={label}
              value={value}
              className={classes.tab}
            />
          ))}
        </Tabs>
      </Box>
    </Paper>
  );
};
