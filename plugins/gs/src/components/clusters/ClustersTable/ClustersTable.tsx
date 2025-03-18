import React, { useCallback, useEffect, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Box, Typography } from '@material-ui/core';
import type {
  Cluster,
  ControlPlane,
  ProviderCluster,
  ProviderClusterIdentity,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  getClusterCreationTimestamp,
  getClusterDescription,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  getControlPlaneK8sVersion,
  getProviderClusterAppSourceLocation,
  getProviderClusterAppVersion,
  getProviderClusterIdentityAWSAccountUrl,
  getProviderClusterIdentityAWSAccountId,
  getProviderClusterLocation,
  isClusterCreating,
  isClusterDeleting,
} from '@giantswarm/backstage-plugin-gs-common';
import { ClusterStatuses } from '../ClusterStatus';
import { calculateClusterType } from '../utils';
import { getInitialColumns, Row } from './columns';
import { useClustersData } from '../ClustersDataProvider';
import { useInstallationsStatuses } from '../../hooks';
import { InstallationsErrors } from '../../InstallationsErrors';

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

      const awsAccountUrl = providerClusterIdentity
        ? getProviderClusterIdentityAWSAccountUrl(providerClusterIdentity)
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
        awsAccountUrl,
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
  const [columns, setColumns] = useState(getInitialColumns());

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

  const {
    data: clustersData,
    isLoading,
    retry,
    setVisibleColumns,
  } = useClustersData();

  useEffect(() => {
    const visibleColumns = columns
      .filter(column => !Boolean(column.hidden))
      .map(column => column.field) as string[];

    setVisibleColumns(visibleColumns);
  }, [columns, setVisibleColumns]);

  const { installationsStatuses } = useInstallationsStatuses();
  const installationsErrors = installationsStatuses.some(
    installationStatus => installationStatus.isError,
  );

  return (
    <>
      {installationsErrors && (
        <Box mb={2}>
          <InstallationsErrors installationsStatuses={installationsStatuses} />
        </Box>
      )}
      <ClustersTableView
        columns={columns}
        loading={isLoading}
        retry={retry}
        clustersData={clustersData}
        onChangeColumnHidden={handleChangeColumnHidden}
      />
    </>
  );
};
