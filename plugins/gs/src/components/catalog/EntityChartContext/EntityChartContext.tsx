import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box, Typography } from '@material-ui/core';
import { ChartSelector } from './ChartSelector';
import { getHelmChartsFromEntity } from '../../utils/entity';

const STORAGE_KEY_PREFIX = 'gs-entity-selected-chart';

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
 * Provider for entities with multiple charts.
 * Uses local storage to persist chart selection.
 */
const MultiChartProvider = ({
  children,
  charts,
  storageKey,
}: {
  children: ReactNode;
  charts: Chart[];
  storageKey: string;
}) => {
  const [storedChartRef, setStoredChartRef] = useLocalStorageState<string>(
    storageKey,
    { defaultValue: '' },
  );

  // Get selected chart ref from local storage or default to first chart
  const selectedChartRef = useMemo(() => {
    if (storedChartRef) {
      // Validate that the stored chart exists
      const chartExists = charts.some(chart => chart.ref === storedChartRef);
      if (chartExists) {
        return storedChartRef;
      }
    }
    return charts[0]?.ref ?? '';
  }, [storedChartRef, charts]);

  const selectedChart = useMemo(
    () => charts.find(chart => chart.ref === selectedChartRef) ?? charts[0],
    [charts, selectedChartRef],
  );

  const value = useMemo(
    () => ({
      charts,
      selectedChart,
      setSelectedChartRef: setStoredChartRef,
    }),
    [charts, selectedChart, setStoredChartRef],
  );

  return (
    <EntityChartContext.Provider value={value}>
      <Box mb={2}>
        <ChartSelector
          charts={charts}
          selectedChartRef={selectedChartRef}
          onChartChange={setStoredChartRef}
        />
      </Box>
      {children}
    </EntityChartContext.Provider>
  );
};

/**
 * Provider for entities with a single chart.
 * No local storage is used.
 */
const SingleChartProvider = ({
  children,
  charts,
}: {
  children: ReactNode;
  charts: Chart[];
}) => {
  const selectedChart = charts[0];

  const setSelectedChartRef = useCallback(() => {
    // No-op for single chart entities
  }, []);

  const value = useMemo(
    () => ({
      charts,
      selectedChart,
      setSelectedChartRef,
    }),
    [charts, selectedChart, setSelectedChartRef],
  );

  return (
    <EntityChartContext.Provider value={value}>
      {children}
    </EntityChartContext.Provider>
  );
};

/**
 * Provides chart selection context to child components.
 * Fetches charts from the current entity using useEntity hook.
 * Displays a chart selector when there are multiple charts.
 * Auto-selects the first chart by default, or uses local storage if present.
 * Persists selected chart to local storage only when multiple charts exist.
 * Shows an error message when no charts are configured.
 *
 * @public
 */
export const EntityChartProvider = ({ children }: EntityChartProviderProps) => {
  const { entity } = useEntity();
  const charts = getHelmChartsFromEntity(entity);

  const entityRef = stringifyEntityRef(entity);
  const storageKey = `${STORAGE_KEY_PREFIX}-${entityRef}`;

  if (charts.length === 0) {
    return (
      <Typography>
        No helm charts configured for this entity. Add the{' '}
        <code>giantswarm.io/helmcharts</code> annotation to configure charts.
      </Typography>
    );
  }

  if (charts.length === 1) {
    return (
      <SingleChartProvider charts={charts}>{children}</SingleChartProvider>
    );
  }

  return (
    <MultiChartProvider charts={charts} storageKey={storageKey}>
      {children}
    </MultiChartProvider>
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
