import React from 'react';
import {
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
import { ClusterStatus, ClusterStatuses } from '../ClusterStatus';
import { sortAndFilterOptions } from '../utils/tableHelpers';

const ClusterTypes = {
  'Management': 'management',
  'Workload': 'workload',
} as const;

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
  type: string;
  organization?: string;
  created?: string;
  priority?: string;
  status: string;
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
    ...sortAndFilterOptions((row) => `${row.name} ${row.description}`),
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
    title: 'Service Priority',
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
      return <ClusterStatus status={row.status} />
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
