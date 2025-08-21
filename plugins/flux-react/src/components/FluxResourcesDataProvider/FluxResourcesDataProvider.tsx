import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResources } from '../FluxOverviewDataProvider/useFluxResources';
import { FluxResourceData, collectResourceData } from './utils';
import { FiltersData, useFilters } from '@giantswarm/backstage-plugin-ui-react';
import { KindFilter, StatusFilter } from '../FluxResourcesPage/filters/filters';

export type DefaultFluxResourceFilters = {
  kind?: KindFilter;
  status?: StatusFilter;
};

export type FluxResourcesData = FiltersData<DefaultFluxResourceFilters> & {
  data: FluxResourceData[];
  filteredData: FluxResourceData[];
  isLoading: boolean;
  setActiveClusters: (clusters: string[]) => void;
};

const FluxResourcesDataContext = createContext<FluxResourcesData | undefined>(
  undefined,
);

export function useFluxResourcesData(): FluxResourcesData {
  const value = useContext(FluxResourcesDataContext);

  if (!value) {
    throw new Error('FluxResourcesDataContext not available');
  }

  return value;
}

type FluxResourcesDataProviderProps = {
  children: ReactNode;
};

export const FluxResourcesDataProvider = ({
  children,
}: FluxResourcesDataProviderProps) => {
  const [activeClusters, setActiveClusters] = useState<string[]>([]);
  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultFluxResourceFilters>();

  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
    errors,
  } = useFluxResources(activeClusters);

  useShowErrors(errors);

  const fluxResourcesData = useMemo(() => {
    if (isLoading) {
      return [];
    }

    const resources = [
      ...kustomizations,
      ...helmReleases,
      ...gitRepositories,
      ...ociRepositories,
      ...helmRepositories,
    ];

    return resources.map(resource => collectResourceData(resource));
  }, [
    isLoading,
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
  ]);

  const contextValue: FluxResourcesData = useMemo(() => {
    const appliedFilters = Object.values(filters).filter(filter =>
      Boolean(filter),
    );

    const filteredData = fluxResourcesData.filter(item => {
      return appliedFilters.every(filter => filter.filter(item));
    });

    return {
      data: fluxResourcesData,
      filteredData,
      isLoading,
      setActiveClusters,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [filters, fluxResourcesData, isLoading, queryParameters, updateFilters]);

  return (
    <FluxResourcesDataContext.Provider value={contextValue}>
      {children}
    </FluxResourcesDataContext.Provider>
  );
};
