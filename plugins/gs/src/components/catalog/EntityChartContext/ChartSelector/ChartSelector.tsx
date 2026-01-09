import { useMemo } from 'react';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import { Chart } from '../EntityChartContext';

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
  const items = useMemo(
    () =>
      charts.map(chart => ({
        label: chart.name,
        value: chart.ref,
      })),
    [charts],
  );

  const handleChange = (newValue: string | null) => {
    if (newValue) {
      onChartChange(newValue);
    }
  };

  return (
    <Autocomplete
      label="Chart"
      items={items}
      selectedValue={selectedChartRef}
      onChange={handleChange}
    />
  );
};

