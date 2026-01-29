import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { FiltersData, useFilters } from '@giantswarm/backstage-plugin-ui-react';
import {
  useControlPlanesForClusters,
  useProviderClustersForClusters,
  useProviderClusterIdentitiesForProviderClusters,
} from '../../hooks';
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
import {
  AWSClusterRoleIdentity,
  Cluster,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findResourceByRef } from '../../utils/findResourceByRef';

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
  setActiveInstallations: (installations: string[]) => void;
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
  const [activeInstallations, setActiveInstallations] = useState<string[]>([]);
  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultClusterFilters>();

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const {
    resources: clusterResources,
    errors: clusterErrors,
    isLoading: isLoadingClusters,
    retry,
  } = useResources(activeInstallations, Cluster);

  const controlPlanesRequired = visibleColumns.includes(
    ClusterColumns.kubernetesVersion,
  );

  const {
    resources: controlPlaneResources,
    errors: controlPlaneErrors,
    isLoading: isLoadingControlPlanes,
  } = useControlPlanesForClusters(clusterResources, {
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
    errors: providerClusterErrors,
    isLoading: isLoadingProviderClusters,
  } = useProviderClustersForClusters(clusterResources, {
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
    errors: providerClusterIdentityErrors,
    isLoading: isLoadingProviderClusterIdentities,
  } = useProviderClusterIdentitiesForProviderClusters(
    providerClusterResources,
    {
      enabled:
        providerClusterIdentitiesRequired &&
        !isLoadingProviderClusters &&
        providerClusterResources.length > 0,
    },
  );

  const isLoading =
    isLoadingClusters ||
    isLoadingControlPlanes ||
    isLoadingProviderClusters ||
    isLoadingProviderClusterIdentities;

  const errors = useMemo(() => {
    return [
      ...clusterErrors,
      ...controlPlaneErrors,
      ...providerClusterErrors,
      ...providerClusterIdentityErrors,
    ];
  }, [
    clusterErrors,
    controlPlaneErrors,
    providerClusterErrors,
    providerClusterIdentityErrors,
  ]);

  const displayErrors = useMemo(() => {
    return errors.filter(
      errorInfo =>
        errorInfo.type === 'incompatibility' ||
        errorInfo.error.name !== 'RejectedError',
    );
  }, [errors]);

  useShowErrors(displayErrors);

  const clustersData = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return clusterResources.map(cluster => {
      let controlPlane = null;
      if (controlPlaneResources.length) {
        const controlPlaneRef = cluster.getControlPlaneRef();
        if (controlPlaneRef) {
          controlPlane = findResourceByRef(controlPlaneResources, {
            installationName: cluster.cluster,
            ...controlPlaneRef,
          });
        }
      }

      let providerCluster = null;
      if (providerClusterResources.length) {
        const infrastructureRef = cluster.getInfrastructureRef();
        if (infrastructureRef) {
          providerCluster = findResourceByRef(providerClusterResources, {
            installationName: cluster.cluster,
            ...infrastructureRef,
          });
        }
      }

      let awsClusterRoleIdentity: AWSClusterRoleIdentity | null = null;
      if (providerCluster && providerClusterIdentityResources.length) {
        const providerClusterIdentityRef = providerCluster.getIdentityRef();
        if (
          providerClusterIdentityRef &&
          providerClusterIdentityRef.kind === AWSClusterRoleIdentity.kind
        ) {
          awsClusterRoleIdentity = findResourceByRef(
            providerClusterIdentityResources,
            {
              installationName: providerCluster.cluster,
              ...providerClusterIdentityRef,
            },
          );
        }
      }

      return collectClusterData({
        installationName: cluster.cluster,
        cluster,
        controlPlane,
        providerCluster,
        awsClusterRoleIdentity,
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
      setActiveInstallations,

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
    updateFilters,
    visibleColumns,
  ]);

  return (
    <ClustersDataContext.Provider value={contextValue}>
      {children}
    </ClustersDataContext.Provider>
  );
};
