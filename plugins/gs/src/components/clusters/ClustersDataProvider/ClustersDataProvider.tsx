import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import type {
  Cluster,
  ControlPlane,
  ProviderCluster,
  ProviderClusterIdentity,
  Resource,
} from '@giantswarm/backstage-plugin-gs-common';
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
import { KindFilter } from '../ClustersPage/filters/filters';

export type ClusterData = {
  installationName: string;
  cluster: Cluster;
  controlPlane?: ControlPlane | null;
  providerCluster?: ProviderCluster | null;
  providerClusterIdentity?: ProviderClusterIdentity | null;
};

export type DefaultClusterFilters = {
  kind?: KindFilter;
};

export type ClustersData = FiltersData<DefaultClusterFilters> & {
  resources: Resource<Cluster>[];
  data: ClusterData[];
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

  const clusterDataList = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return clusterResources.map(({ installationName, ...cluster }) => {
      const data: ClusterData = {
        installationName,
        cluster,
      };

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

      data.controlPlane = controlPlane;
      data.providerCluster = providerCluster;
      data.providerClusterIdentity = providerClusterIdentity;

      return data;
    });
  }, [
    isLoading,
    clusterResources,
    controlPlaneResources,
    providerClusterResources,
    providerClusterIdentityResources,
  ]);

  const clustersData: ClustersData = useMemo(() => {
    return {
      resources: clusterResources,
      data: clusterDataList,
      isLoading,
      retry,
      setVisibleColumns,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [
    clusterDataList,
    clusterResources,
    filters,
    isLoading,
    queryParameters,
    retry,
    updateFilters,
  ]);

  return (
    <ClustersDataContext.Provider value={clustersData}>
      {children}
    </ClustersDataContext.Provider>
  );
};
