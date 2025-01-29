import React, { useCallback, useMemo } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import type {
  Cluster,
  ControlPlane,
  ProviderCluster,
  ProviderClusterIdentity,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  findResourceByRef,
  getClusterControlPlaneRef,
  getClusterCreationTimestamp,
  getClusterDescription,
  getClusterInfrastructureRef,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  getControlPlaneK8sVersion,
  getProviderClusterAppSourceLocation,
  getProviderClusterAppVersion,
  getProviderClusterIdentityAWSAccountId,
  getProviderClusterIdentityRef,
  getProviderClusterLocation,
  isClusterCreating,
  isClusterDeleting,
} from '@giantswarm/backstage-plugin-gs-common';
import { useClusters } from '../../hooks';
import { ClusterStatuses } from '../ClusterStatus';
import { calculateClusterType } from '../utils';

import { useProviderClusters } from '../../hooks/useProviderClusters';
import { useProviderClustersIdentities } from '../../hooks/useProviderClustersIdentities';
import { getInitialColumns, Row } from './columns';
import { useControlPlanes } from '../../hooks/useControlPlanes';

const calculateClusterStatus = (cluster: Cluster) => {
  if (isClusterDeleting(cluster)) {
    return ClusterStatuses.Deleting;
  }

  if (isClusterCreating(cluster)) {
    return ClusterStatuses.Creating;
  }

  return ClusterStatuses.Ready;
};

type ClusterData = {
  installationName: string;
  cluster: Cluster;
  controlPlane?: ControlPlane | null;
  providerCluster?: ProviderCluster | null;
  providerClusterIdentity?: ProviderClusterIdentity | null;
};

type Props = {
  columns: TableColumn<Row>[];
  loading: boolean;
  retry: () => void;
  clustersData: ClusterData[];
  onChangeColumnHidden: (field: string, hidden: boolean) => void;
};

const ClustersTableView = ({
  columns,
  loading,
  clustersData,
  retry,
  onChangeColumnHidden,
}: Props) => {
  const data: Row[] = clustersData.map(
    ({
      installationName,
      cluster,
      controlPlane,
      providerCluster,
      providerClusterIdentity,
    }) => {
      const appVersion = providerCluster
        ? getProviderClusterAppVersion(providerCluster)
        : undefined;

      const appSourceLocation = providerCluster
        ? getProviderClusterAppSourceLocation(providerCluster)
        : undefined;

      const kubernetesVersion = controlPlane
        ? getControlPlaneK8sVersion(controlPlane)
        : undefined;

      const location = providerCluster
        ? getProviderClusterLocation(providerCluster)
        : undefined;

      const awsAccountId = providerClusterIdentity
        ? getProviderClusterIdentityAWSAccountId(providerClusterIdentity)
        : undefined;

      return {
        installationName,
        name: getClusterName(cluster),
        namespace: getClusterNamespace(cluster),
        description: getClusterDescription(cluster),
        type: calculateClusterType(cluster, installationName),
        organization: getClusterOrganization(cluster),
        created: getClusterCreationTimestamp(cluster),
        priority: getClusterServicePriority(cluster),
        status: calculateClusterStatus(cluster),
        apiVersion: cluster.apiVersion,
        appVersion,
        appSourceLocation,
        kubernetesVersion,
        releaseVersion: getClusterReleaseVersion(cluster),
        location,
        awsAccountId,
      };
    },
  );

  return (
    <Table<Row>
      isLoading={loading}
      options={{
        paging: false,
        columnsButton: true,
      }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload clusters',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={data}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Clusters</Typography>}
      columns={columns}
      onChangeColumnHidden={(column, hidden) => {
        if (column.field) {
          onChangeColumnHidden(column.field, hidden);
        }
      }}
    />
  );
};

export const ClustersTable = () => {
  const [columns, setColumns] = React.useState(getInitialColumns());
  const visibleColumns = columns
    .filter(column => !Boolean(column.hidden))
    .map(column => column.field);

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

  const handleChangeColumnHidden = useCallback(
    (field: string, hidden: boolean) => {
      setColumns(prev =>
        prev.map(column => {
          if (column.field === field) {
            return {
              ...column,
              hidden,
            };
          }

          return column;
        }),
      );
    },
    [],
  );

  return (
    <ClustersTableView
      columns={columns}
      loading={isLoading}
      retry={retry}
      clustersData={clustersData}
      onChangeColumnHidden={handleChangeColumnHidden}
    />
  );
};
