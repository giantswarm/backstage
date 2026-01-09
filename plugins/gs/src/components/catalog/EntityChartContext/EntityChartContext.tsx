import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { ChartSelector } from './ChartSelector';
import { getHelmChartsFromEntity } from '../../utils/entity';

export type Chart = {
  ref: string;
  registry: string;
  repository: string;
  name: string;
};

type EntityChartContextValue = {
  charts: Chart[];
  selectedChart: Chart;
  setSelectedChartRef: (chartRef: string) => void;
};

const EntityChartContext = createContext<EntityChartContextValue | null>(null);

export interface EntityChartProviderProps {
  children: ReactNode;
}

/**
 * Provides chart selection context to child components.
 * Fetches charts from the current entity using useEntity hook.
 * Displays a chart selector when there are multiple charts.
 * Auto-selects the first chart by default.
 * Shows an error message when no charts are configured.
 *
 * @public
 */
export const EntityChartProvider = ({ children }: EntityChartProviderProps) => {
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

  const value = useMemo(
    () => ({
      charts,
      selectedChart,
      setSelectedChartRef,
    }),
    [charts, selectedChart],
  );

  if (charts.length === 0) {
    return (
      <Typography>
        No helm charts configured for this entity. Add the{' '}
        <code>giantswarm.io/helmcharts</code> annotation to configure charts.
      </Typography>
    );
  }

  return (
    <EntityChartContext.Provider value={value}>
      {showChartSelector && (
        <Box mb={2}>
          <ChartSelector
            charts={charts}
            selectedChartRef={selectedChartRef}
            onChartChange={setSelectedChartRef}
          />
        </Box>
      )}
      {children}
    </EntityChartContext.Provider>
  );
};

/**
 * Grab the current chart from the context.
 * Throws if used outside of an EntityChartProvider.
 *
 * @public
 */
export function useCurrentEntityChart(): {
  charts: Chart[];
  selectedChart: Chart;
  setSelectedChartRef: (chartRef: string) => void;
} {
  const value = useContext(EntityChartContext);

  if (!value) {
    throw new Error(
      'useCurrentEntityChart must be used within an EntityChartProvider. Make sure the component is wrapped with EntityChartProvider.',
    );
  }

  return value;
}
