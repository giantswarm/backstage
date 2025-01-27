import React, { useMemo } from 'react';
import { Table } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import type {
  Cluster,
  ProviderCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  findResourceByRef,
  getClusterAppVersion,
  getClusterCreationTimestamp,
  getClusterDescription,
  getClusterInfrastructureRef,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  getProviderClusterLocation,
  isClusterCreating,
  isClusterDeleting,
} from '@giantswarm/backstage-plugin-gs-common';
import { useClusters } from '../../hooks';
import { ClusterStatuses } from '../ClusterStatus';
import { calculateClusterType } from '../utils';

import { useProviderClusters } from '../../hooks/useProviderClusters';
import { getInitialColumns, Row } from './columns';

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
  providerCluster?: ProviderCluster | null;
};

type Props = {
  loading: boolean;
  retry: () => void;
  clustersData: ClusterData[];
};

const ClustersTableView = ({ loading, retry, clustersData }: Props) => {
  const columns = getInitialColumns();

  const data = clustersData.map(
    ({ installationName, cluster, providerCluster }) => {
      const location = providerCluster
        ? getProviderClusterLocation(providerCluster)
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
        appVersion: getClusterAppVersion(cluster),
        releaseVersion: getClusterReleaseVersion(cluster),
        location,
      };
    },
  );

  return (
    <Table<Row>
      isLoading={loading}
      options={{ paging: false }}
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
    />
  );
};

export const ClustersTable = () => {
  const {
    resources: clusterResources,
    isLoading: isLoadingClusters,
    retry,
  } = useClusters();

  const {
    resources: providerClusterResources,
    isLoading: isLoadingProviderClusters,
  } = useProviderClusters(clusterResources, {
    enabled: !isLoadingClusters && clusterResources.length > 0,
  });

  const isLoading = isLoadingClusters || isLoadingProviderClusters;

  const clustersData = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return clusterResources.map(({ installationName, ...cluster }) => {
      const data: ClusterData = {
        installationName,
        cluster,
      };

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

      data.providerCluster = providerCluster;

      return data;
    });
  }, [isLoading, clusterResources, providerClusterResources]);

  return (
    <ClustersTableView
      loading={isLoading}
      retry={retry}
      clustersData={clustersData}
    />
  );
};
