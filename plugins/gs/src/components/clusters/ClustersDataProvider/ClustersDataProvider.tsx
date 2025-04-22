import React, { createContext, ReactNode, useContext, useMemo } from 'react';
import {
  findResourceByRef,
  getClusterControlPlaneRef,
  getClusterInfrastructureRef,
  getProviderClusterIdentityRef,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  FiltersData,
  useClusters,
  useFilters,
  useTableColumns,
} from '../../hooks';
import { useProviderClusters } from '../../hooks/useProviderClusters';
import { useProviderClustersIdentities } from '../../hooks/useProviderClustersIdentities';
import { useControlPlanes } from '../../hooks/useControlPlanes';
import {
  AppVersionFilter,
  KindFilter,
  KubernetesVersionFilter,
  LocationFilter,
  LabelFilter,
  OrganizationFilter,
  ProviderFilter,
  ReleaseVersionFilter,
  StatusFilter,
} from '../ClustersPage/filters/filters';
import { ClusterData, collectClusterData } from './utils';
import { ClusterColumns } from '../ClustersTable/columns';

export type DefaultClusterFilters = {
  kind?: KindFilter;
  provider?: ProviderFilter;
  organization?: OrganizationFilter;
  releaseVersion?: ReleaseVersionFilter;
  kubernetesVersion?: KubernetesVersionFilter;
  appVersion?: AppVersionFilter;
  status?: StatusFilter;
  location?: LocationFilter;
  label?: LabelFilter;
};

export type ClustersData = FiltersData<DefaultClusterFilters> & {
  data: ClusterData[];
  filteredData: ClusterData[];
  isLoading: boolean;
  retry: () => void;
  visibleColumns: string[];
  setVisibleColumns: (columns: string[]) => void;
};

const ClustersDataContext = createContext<ClustersData | undefined>(undefined);

export function useClustersData(): ClustersData {
  const value = useContext(ClustersDataContext);

  if (!value) {
    throw new Error('ClustersDataContext not available');
  }

  return value;
}

type ClustersDataProviderProps = {
  children: ReactNode;
};

export const ClustersDataProvider = ({
  children,
}: ClustersDataProviderProps) => {
  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultClusterFilters>();

  const { visibleColumns, setVisibleColumns } = useTableColumns('clusters');

  const {
    resources: clusterResources,
    isLoading: isLoadingClusters,
    retry,
  } = useClusters();

  const controlPlanesRequired = visibleColumns.includes(
    ClusterColumns.kubernetesVersion,
  );

  const {
    resources: controlPlaneResources,
    isLoading: isLoadingControlPlanes,
  } = useControlPlanes(clusterResources, {
    enabled:
      controlPlanesRequired &&
      !isLoadingClusters &&
      clusterResources.length > 0,
  });

  const providerClustersRequired =
    visibleColumns.includes(ClusterColumns.appVersion) ||
    visibleColumns.includes(ClusterColumns.location) ||
    visibleColumns.includes(ClusterColumns.awsAccountId);

  const {
    resources: providerClusterResources,
    isLoading: isLoadingProviderClusters,
  } = useProviderClusters(clusterResources, {
    enabled:
      providerClustersRequired &&
      !isLoadingClusters &&
      clusterResources.length > 0,
  });

  const providerClusterIdentitiesRequired = visibleColumns.includes(
    ClusterColumns.awsAccountId,
  );

  const {
    resources: providerClusterIdentityResources,
    isLoading: isLoadingProviderClusterIdentities,
  } = useProviderClustersIdentities(providerClusterResources, {
    enabled:
      providerClusterIdentitiesRequired &&
      !isLoadingProviderClusters &&
      providerClusterResources.length > 0,
  });

  const isLoading =
    isLoadingClusters ||
    isLoadingControlPlanes ||
    isLoadingProviderClusters ||
    isLoadingProviderClusterIdentities;

  const clustersData = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return clusterResources.map(({ installationName, ...cluster }) => {
      let controlPlane = null;
      if (controlPlaneResources.length) {
        const controlPlaneRef = getClusterControlPlaneRef(cluster);
        if (controlPlaneRef) {
          controlPlane = findResourceByRef(controlPlaneResources, {
            installationName,
            ...controlPlaneRef,
          });
        }
      }

      let providerCluster = null;
      if (providerClusterResources.length) {
        const infrastructureRef = getClusterInfrastructureRef(cluster);
        if (infrastructureRef) {
          providerCluster = findResourceByRef(providerClusterResources, {
            installationName,
            ...infrastructureRef,
          });
        }
      }

      let providerClusterIdentity = null;
      if (providerCluster && providerClusterIdentityResources.length) {
        const providerClusterIdentityRef =
          getProviderClusterIdentityRef(providerCluster);
        if (providerClusterIdentityRef) {
          providerClusterIdentity = findResourceByRef(
            providerClusterIdentityResources,
            { installationName, ...providerClusterIdentityRef },
          );
        }
      }

      return collectClusterData({
        installationName,
        cluster,
        controlPlane,
        providerCluster,
        providerClusterIdentity,
      });
    });
  }, [
    isLoading,
    clusterResources,
    controlPlaneResources,
    providerClusterResources,
    providerClusterIdentityResources,
  ]);

  const contextValue: ClustersData = useMemo(() => {
    const appliedFilters = Object.values(filters).filter(filter =>
      Boolean(filter),
    );

    const filteredData = clustersData.filter(item => {
      return appliedFilters.every(filter => filter.filter(item));
    });

    return {
      data: clustersData,
      filteredData,
      isLoading,
      retry,
      visibleColumns,
      setVisibleColumns,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [
    clustersData,
    filters,
    isLoading,
    queryParameters,
    retry,
    setVisibleColumns,
    updateFilters,
    visibleColumns,
  ]);

  return (
    <ClustersDataContext.Provider value={contextValue}>
      {children}
    </ClustersDataContext.Provider>
  );
};
