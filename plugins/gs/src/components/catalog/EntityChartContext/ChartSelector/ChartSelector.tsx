import { useMemo } from 'react';
import { Chart } from '../EntityChartContext';
import { makeStyles, Paper, Tab, Tabs } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  tab: {
    padding: theme.spacing(2, 4),
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
      <Tabs
        value={selectedChartRef}
        indicatorColor="primary"
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
    </Paper>
  );
};
