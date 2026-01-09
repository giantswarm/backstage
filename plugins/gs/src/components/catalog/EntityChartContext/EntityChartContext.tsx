import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { ChartSelector } from './ChartSelector';
import { getHelmChartsFromEntity } from '../../utils/entity';

const CHART_QUERY_PARAM = 'chart';

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
 * Auto-selects the first chart by default, or uses URL query param if present.
 * Syncs selected chart with URL query params when multiple charts exist.
 * Shows an error message when no charts are configured.
 *
 * @public
 */
export const EntityChartProvider = ({ children }: EntityChartProviderProps) => {
  const { entity } = useEntity();
  const charts = getHelmChartsFromEntity(entity);
  const [searchParams, setSearchParams] = useSearchParams();

  const hasMultipleCharts = charts.length > 1;

  // Get selected chart ref from URL or default to first chart
  const chartFromUrl = searchParams.get(CHART_QUERY_PARAM);
  const selectedChartRef = useMemo(() => {
    if (hasMultipleCharts && chartFromUrl) {
      // Validate that the chart from URL exists
      const chartExists = charts.some(chart => chart.ref === chartFromUrl);
      if (chartExists) {
        return chartFromUrl;
      }
    }
    return charts[0]?.ref ?? '';
  }, [hasMultipleCharts, chartFromUrl, charts]);

  const setSelectedChartRef = useCallback(
    (chartRef: string) => {
      if (!hasMultipleCharts) {
        // Don't update URL if there's only one chart
        return;
      }

      setSearchParams(
        params => {
          params.set(CHART_QUERY_PARAM, chartRef);
          return params;
        },
        { replace: true },
      );
    },
    [hasMultipleCharts, setSearchParams],
  );

  const selectedChart = useMemo(
    () => charts.find(chart => chart.ref === selectedChartRef) ?? charts[0],
    [charts, selectedChartRef],
  );

  const value = useMemo(
    () => ({
      charts,
      selectedChart,
      setSelectedChartRef,
    }),
    [charts, selectedChart, setSelectedChartRef],
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
      {hasMultipleCharts && (
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
