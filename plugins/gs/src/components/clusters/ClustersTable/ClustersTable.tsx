import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Link,
  SubvalueCell,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import type { Cluster, Resource } from '@giantswarm/backstage-plugin-gs-common';
import {
  getClusterAppVersion,
  getClusterCreationTimestamp,
  getClusterDescription,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
  getClusterServicePriority,
  isClusterCreating,
  isClusterDeleting,
} from '@giantswarm/backstage-plugin-gs-common';
import { clusterDetailsRouteRef } from '../../../routes';
import { useClusters } from '../../hooks';
import { DateComponent, Version } from '../../UI';
import { toSentenceCase } from '../../utils/helpers';
import { sortAndFilterOptions } from '../../utils/tableHelpers';
import { ClusterStatus, ClusterStatuses } from '../ClusterStatus';
import { calculateClusterType } from '../utils';

const calculateClusterStatus = (cluster: Cluster) => {
  if (isClusterDeleting(cluster)) {
    return ClusterStatuses.Deleting;
  }

  if (isClusterCreating(cluster)) {
    return ClusterStatuses.Creating;
  }

  return ClusterStatuses.Ready;
};

type Row = {
  installationName: string;
  name: string;
  namespace?: string;
  description?: string;
  type: string;
  organization?: string;
  created?: string;
  priority?: string;
  status: string;
  apiVersion: string;
  appVersion: string;
};

const generatedColumns: TableColumn<Row>[] = [
  {
    title: 'Name',
    field: 'name',
    highlight: true,
    render: row => {
      const LinkWrapper = () => {
        const routeLink = useRouteRef(clusterDetailsRouteRef);
        return (
          <Link
            component={RouterLink}
            to={routeLink({
              installationName: row.installationName,
              namespace: row.namespace ?? 'default',
              name: row.name,
            })}
          >
            {row.name}
          </Link>
        );
      };

      return (
        <SubvalueCell value={<LinkWrapper />} subvalue={row.description} />
      );
    },
    ...sortAndFilterOptions(row => `${row.name} ${row.description}`),
  },
  {
    title: 'Installation',
    field: 'installationName',
  },
  {
    title: 'Cluster App',
    field: 'appVersion',
    render: row => {
      return (
        <Version
          version={row.appVersion}
          sourceLocation="https://github.com/giantswarm/cluster"
          highlight={true}
          displayWarning={false}
        />
      );
    },
  },
  {
    title: 'Type',
    field: 'type',
    render: row => toSentenceCase(row.type),
  },
  {
    title: 'Organization',
    field: 'organization',
  },
  {
    title: 'Service Priority',
    field: 'priority',
    render: row => {
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
    render: row => <DateComponent value={row.created} relative />,
  },
  {
    title: 'Status',
    field: 'status',
    render: row => {
      return <ClusterStatus status={row.status} />;
    },
  },
];

type Props = {
  loading: boolean;
  retry: () => void;
  resources: Resource<Cluster>[];
};

const ClustersTableView = ({ loading, retry, resources }: Props) => {
  const data = resources.map(({ installationName, ...resource }) => ({
    installationName,
    name: getClusterName(resource),
    namespace: getClusterNamespace(resource),
    description: getClusterDescription(resource),
    type: calculateClusterType(resource, installationName),
    organization: getClusterOrganization(resource),
    created: getClusterCreationTimestamp(resource),
    priority: getClusterServicePriority(resource),
    status: calculateClusterStatus(resource),
    apiVersion: resource.apiVersion,
    appVersion: getClusterAppVersion(resource),
  }));

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
      columns={generatedColumns}
    />
  );
};

export const ClustersTable = () => {
  const { resources, initialLoading, retry } = useClusters();

  return (
    <ClustersTableView
      loading={initialLoading}
      resources={resources}
      retry={retry}
    />
  );
};
