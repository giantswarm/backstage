import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResources } from '../FluxOverviewDataProvider/useFluxResources';
import {
  FluxResourceData,
  collectKustomizationData,
  collectHelmReleaseData,
  collectGitRepositoryData,
  collectOCIRepositoryData,
  collectHelmRepositoryData,
  // ClusterFilter,
  // FluxResourceKindFilter,
  // FluxStatusFilter,
} from './utils';

export type DefaultFluxResourceFilters = {
  // cluster?: ClusterFilter;
  // resourceKind?: FluxResourceKindFilter;
  // status?: FluxStatusFilter;
};

export type FiltersData<T> = {
  filters: T;
  queryParameters: Record<string, string | string[]>;
  updateFilters: (filters: Partial<T>) => void;
};

export type FluxResourcesData =
  // FiltersData<DefaultFluxResourceFilters> &
  {
    data: FluxResourceData[];
    filteredData: FluxResourceData[];
    isLoading: boolean;
    // retry: () => void;
    // activeClusters: string[] | null;
    setActiveClusters: (clusters: string[] | null) => void;
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
  const [activeClusters, setActiveClusters] = useState<string[] | null>(null);

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

  // Simple filter update function (in real implementation, this would handle URL state)
  // const updateFilters = (newFilters: Partial<DefaultFluxResourceFilters>) => {
  //   setFilters(prev => ({ ...prev, ...newFilters }));
  // };

  // Mock query parameters (in real implementation, this would come from URL state)
  // const queryParameters: Record<string, string | string[]> = {};

  // const retry = () => {
  // The useFluxResources hook handles retry internally
  // This could be extended to force refetch if needed
  // };

  const fluxResourcesData = useMemo(() => {
    if (isLoading) {
      return [];
    }

    const allResources: FluxResourceData[] = [];

    // Collect Kustomizations
    kustomizations.forEach(resource => {
      allResources.push(collectKustomizationData(resource));
    });

    // Collect HelmReleases
    helmReleases.forEach(resource => {
      allResources.push(collectHelmReleaseData(resource));
    });

    // Collect GitRepositories
    gitRepositories.forEach(resource => {
      allResources.push(collectGitRepositoryData(resource));
    });

    // Collect OCIRepositories
    ociRepositories.forEach(resource => {
      allResources.push(collectOCIRepositoryData(resource));
    });

    // Collect HelmRepositories
    helmRepositories.forEach(resource => {
      allResources.push(collectHelmRepositoryData(resource));
    });

    return allResources;
  }, [
    isLoading,
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
  ]);

  const contextValue: FluxResourcesData = useMemo(() => {
    // const appliedFilters = Object.values(filters).filter(filter =>
    //   Boolean(filter),
    // );

    const filteredData = fluxResourcesData.filter(item => {
      return true;
      // return appliedFilters.every(filter => filter.filter(item));
    });
    console.log('filteredData', filteredData);

    return {
      data: fluxResourcesData,
      filteredData,
      isLoading,
      // retry,
      // activeCluster,
      setActiveClusters,

      // filters,
      // queryParameters,
      // updateFilters,
    };
  }, [fluxResourcesData, isLoading]);

  return (
    <FluxResourcesDataContext.Provider value={contextValue}>
      {children}
    </FluxResourcesDataContext.Provider>
  );
};
