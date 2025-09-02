import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import {
  HelmRelease,
  GitRepository,
  HelmRepository,
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
import { KustomizationTreeBuilder } from '../FluxOverview/utils/KustomizationTreeBuilder';
import {
  SelectedResourceRef,
  useSelectedResource,
} from '../FluxOverview/useSelectedResource';

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

  treeBuilder?: KustomizationTreeBuilder;
  selectedResourceRef: SelectedResourceRef | null;
  setSelectedResource: (resourceRef: SelectedResourceRef) => void;
  clearSelectedResource: () => void;
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
  const { selectedResourceRef, setSelectedResource, clearSelectedResource } =
    useSelectedResource();

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const {
    resources: {
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
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

  const treeBuilder = useMemo(() => {
    if (!selectedResourceRef) {
      return undefined;
    }
    const selectedKustomizations = kustomizations.filter(
      kustomization => kustomization.cluster === selectedResourceRef.cluster,
    );
    const selectedHelmReleases = helmReleases.filter(
      helmRelease => helmRelease.cluster === selectedResourceRef.cluster,
    );
    const selectedGitRepositories = gitRepositories.filter(
      gitRepository => gitRepository.cluster === selectedResourceRef.cluster,
    );
    const selectedOCIRepositories = ociRepositories.filter(
      ociRepository => ociRepository.cluster === selectedResourceRef.cluster,
    );
    const selectedHelmRepositories = helmRepositories.filter(
      helmRepository => helmRepository.cluster === selectedResourceRef.cluster,
    );

    return new KustomizationTreeBuilder(
      selectedKustomizations,
      selectedHelmReleases,
      selectedGitRepositories,
      selectedOCIRepositories,
      selectedHelmRepositories,
    );
  }, [
    selectedResourceRef,
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
      visibleColumns,
      setVisibleColumns,
      retry: () => {},

      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
      treeBuilder,

      filters,
      queryParameters,
      updateFilters,

      selectedResourceRef,
      setSelectedResource,
      clearSelectedResource,
    };
  }, [
    clearSelectedResource,
    filters,
    fluxResourcesData,
    gitRepositories,
    helmReleases,
    helmRepositories,
    isLoading,
    kustomizations,
    ociRepositories,
    queryParameters,
    selectedResourceRef,
    setSelectedResource,
    treeBuilder,
    updateFilters,
    visibleColumns,
  ]);

  return (
    <FluxResourcesDataContext.Provider value={contextValue}>
      {children}
    </FluxResourcesDataContext.Provider>
  );
};
