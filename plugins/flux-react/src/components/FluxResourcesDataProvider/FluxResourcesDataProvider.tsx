import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import {
  HelmRelease,
  GitRepository,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResources } from '../../hooks/useFluxResources';
import { FluxResourceData, collectResourceData } from './utils';
import { FiltersData, useFilters } from '@giantswarm/backstage-plugin-ui-react';
import {
  KindFilter,
  StatusFilter,
} from '../FluxResourcesListView/filters/filters';

export type DefaultFluxResourceFilters = {
  kind?: KindFilter;
  status?: StatusFilter;
};

export type FluxResourcesData = FiltersData<DefaultFluxResourceFilters> & {
  data: FluxResourceData[];
  filteredData: FluxResourceData[];
  isLoading: boolean;
  setActiveClusters: (clusters: string[]) => void;
  retry: () => void;
  visibleColumns: string[];
  setVisibleColumns: (columns: string[]) => void;

  kustomizations: Kustomization[];
  helmReleases: HelmRelease[];
  gitRepositories: GitRepository[];
  ociRepositories: OCIRepository[];
  helmRepositories: HelmRepository[];
  imagePolicies: ImagePolicy[];
  imageRepositories: ImageRepository[];
  imageUpdateAutomations: ImageUpdateAutomation[];
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
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const {
    resources: {
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
      imagePolicies,
      imageRepositories,
      imageUpdateAutomations,
    },
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
      ...imagePolicies,
      ...imageRepositories,
      ...imageUpdateAutomations,
    ];

    return resources.map(resource => collectResourceData(resource));
  }, [
    isLoading,
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
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
      visibleColumns,
      setVisibleColumns,
      retry: () => {},

      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
      imagePolicies,
      imageRepositories,
      imageUpdateAutomations,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [
    filters,
    fluxResourcesData,
    gitRepositories,
    helmReleases,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
    isLoading,
    kustomizations,
    ociRepositories,
    queryParameters,
    updateFilters,
    visibleColumns,
  ]);

  return (
    <FluxResourcesDataContext.Provider value={contextValue}>
      {children}
    </FluxResourcesDataContext.Provider>
  );
};
