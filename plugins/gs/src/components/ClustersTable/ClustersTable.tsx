import React from 'react';
import {
  StatusError,
  StatusOK,
  StatusWarning,
  SubvalueCell,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useClusters } from '../hooks';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import { Resource } from '../../apis';
import {
  Cluster,
  getClusterDescription,
  getClusterOrganization,
  getClusterCreationTimestamp,
  isClusterCreating,
  isClusterDeleting,
  isManagementCluster,
  getClusterName,
  getClusterServicePriority,
} from '../../model/services/mapi/generic';
import DateComponent from '../UI/Date';
import { toSentenceCase } from '../utils/helpers';

const ClusterTypes = {
  'Management': 'management',
  'Workload': 'workload',
} as const;

type ClusterType = (typeof ClusterTypes)[keyof typeof ClusterTypes];

const ClusterStatuses = {
  'Deleting': 'deleting',
  'Creating': 'creating',
  'Ready': 'ready',
} as const;

type ClusterStatus = (typeof ClusterStatuses)[keyof typeof ClusterStatuses];

const calculateClusterType = (cluster: Cluster, installationName: string) => {
  return isManagementCluster(cluster, installationName)
    ? ClusterTypes.Management
    : ClusterTypes.Workload;
};

const calculateClusterStatus = (cluster: Cluster) => {
  if (isClusterDeleting(cluster)) {
    return ClusterStatuses.Deleting;
  }

  if (isClusterCreating(cluster)) {
    return ClusterStatuses.Creating;
  }

  return ClusterStatuses.Ready;
}

type Row = {
  installationName: string;
  name: string;
  description?: string;
  type: ClusterType;
  organization?: string;
  created?: string;
  priority?: string;
  status: ClusterStatus;
}

const generatedColumns: TableColumn<Row>[] = [
  {
    title: 'Installation',
    field: 'installationName',
  },
  {
    title: 'Name',
    field: 'name',
    highlight: true,
    render: (row) => (
      <SubvalueCell value={row.name} subvalue={row.description} />
    ),
    customFilterAndSearch: (
      query,
      row,
    ) =>
      `${row.name} ${row.description}`
      .toLocaleUpperCase('en-US')
      .includes(query.toLocaleUpperCase('en-US')),
  },
  {
    title: 'Type',
    field: 'type',
    render: (row) => (
      toSentenceCase(row.type)
    ),
  },
  {
    title: 'Organization',
    field: 'organization',
  },
  {
    title: 'Priority',
    field: 'priority',
    render: (row) => {
      if (!row.priority) {
        return 'n/a';
      }

      return toSentenceCase(row.priority);
    },
  },
  {
    title: 'Created',
    field: 'created',
    type: 'datetime',
    render: (row) => (
      <DateComponent value={row.created} relative />
    ),
  },
  {
    title: 'Status',
    field: 'status',
    render: (row) => {
      const statusLabel = toSentenceCase(row.status);

      switch (row.status) {
        case ClusterStatuses.Creating:
          return <StatusWarning>{statusLabel}</StatusWarning>;
        
        case ClusterStatuses.Deleting:
          return <StatusError>{statusLabel}</StatusError>;
        
        default:
          return <StatusOK>{statusLabel}</StatusOK>;
      }
    },
  },
];

type Props = {
  loading: boolean;
  retry: () => void;
  resources: Resource<Cluster>[];
};

const ClustersTableView = ({
  loading,
  retry,
  resources,
}: Props) => {
  const data = resources.map(({installationName, ...resource}) => (
    {
      installationName,
      name: getClusterName(resource),
      description: getClusterDescription(resource),
      type: calculateClusterType(resource, installationName),
      organization: getClusterOrganization(resource),
      created: getClusterCreationTimestamp(resource),
      priority: getClusterServicePriority(resource),
      status: calculateClusterStatus(resource),
    }
  ));

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
      title={
        <Typography variant="h6">Clusters</Typography>
      }
      columns={generatedColumns}
    />
  );
};

export const ClustersTable = () => {
  const { installationsData, initialLoading, retry } = useClusters();

  const resources: Resource<Cluster>[] = installationsData.flatMap(
    ({ installationName, data }) => data.map((cluster) => ({ installationName, ...cluster }))
  );

  return (
    <ClustersTableView
      loading={initialLoading}
      resources={resources}
      retry={retry}
    />
  );
};
