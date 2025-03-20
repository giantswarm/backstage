import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  findResourceByRef,
  getClusterControlPlaneRef,
  getClusterInfrastructureRef,
  getProviderClusterIdentityRef,
} from '@giantswarm/backstage-plugin-gs-common';
import { FiltersData, useClusters, useFilters } from '../../hooks';
import { useProviderClusters } from '../../hooks/useProviderClusters';
import { useProviderClustersIdentities } from '../../hooks/useProviderClustersIdentities';
import { useControlPlanes } from '../../hooks/useControlPlanes';
import {
  KindFilter,
  OrganizationFilter,
} from '../ClustersPage/filters/filters';
import { ClusterData, collectClusterData } from './utils';

export type DefaultClusterFilters = {
  kind?: KindFilter;
  organization?: OrganizationFilter;
};

export type ClustersData = FiltersData<DefaultClusterFilters> & {
  data: ClusterData[];
  filteredData: ClusterData[];
  isLoading: boolean;
  retry: () => void;
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

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const {
    resources: clusterResources,
    isLoading: isLoadingClusters,
    retry,
  } = useClusters();

  const controlPlanesRequired = visibleColumns.includes('kubernetesVersion');

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
    visibleColumns.includes('appVersion') ||
    visibleColumns.includes('location') ||
    visibleColumns.includes('awsAccountId');

  const {
    resources: providerClusterResources,
    isLoading: isLoadingProviderClusters,
  } = useProviderClusters(clusterResources, {
    enabled:
      providerClustersRequired &&
      !isLoadingClusters &&
      clusterResources.length > 0,
  });

  const providerClusterIdentitiesRequired =
    visibleColumns.includes('awsAccountId');

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
      setVisibleColumns,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [clustersData, filters, isLoading, queryParameters, retry, updateFilters]);

  return (
    <ClustersDataContext.Provider value={contextValue}>
      {children}
    </ClustersDataContext.Provider>
  );
};
