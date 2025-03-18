import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Link, SubvalueCell, TableColumn } from '@backstage/core-components';
import { clusterDetailsRouteRef } from '../../../routes';
import {
  semverCompareSort,
  sortAndFilterOptions,
} from '../../utils/tableHelpers';
import { formatVersion, toSentenceCase } from '../../utils/helpers';
import { Account, DateComponent, KubernetesVersion, Version } from '../../UI';
import { ClusterStatus } from '../ClusterStatus';
import { ClusterTypes } from '../utils';
import { Box, Tooltip, Typography } from '@material-ui/core';
import {
  ClusterTypeManagementIcon,
  ClusterTypeWorkloadIcon,
} from '../../../assets/icons/CustomIcons';
import { ClusterData } from '../ClustersDataProvider';

export const renderClusterType = (clusterType: string) => {
  if (clusterType === ClusterTypes.Management) {
    return (
      <Tooltip title="Management cluster">
        <Box display="inline-block">
          <ClusterTypeManagementIcon />
        </Box>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Workload cluster">
      <Box display="inline-block">
        <ClusterTypeWorkloadIcon />
      </Box>
    </Tooltip>
  );
};

export const getInitialColumns = (): TableColumn<ClusterData>[] => [
  {
    title: 'Type',
    field: 'type',
    width: 'auto',
    render: row => {
      return renderClusterType(row.type);
    },
  },
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
            <Typography variant="inherit" noWrap>
              {row.name}
            </Typography>
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
    title: 'Release',
    field: 'releaseVersion',
    render: row => {
      return <Version version={row.releaseVersion || ''} highlight />;
    },
    customSort: semverCompareSort(row => row.releaseVersion),
  },
  {
    title: 'Cluster App',
    field: 'appVersion',
    hidden: true,
    render: row => {
      return (
        <Version
          version={row.appVersion || ''}
          highlight
          sourceLocation={row.appSourceLocation}
          displayWarning={false}
        />
      );
    },
    customSort: semverCompareSort(row => row.appVersion),
  },
  {
    title: 'Kubernetes Version',
    field: 'kubernetesVersion',
    hidden: true,
    render: row => {
      return (
        row.kubernetesVersion && (
          <KubernetesVersion
            version={formatVersion(row.kubernetesVersion)}
            hideIcon
            hideLabel
          />
        )
      );
    },
    customSort: semverCompareSort(row => row.kubernetesVersion),
  },
  {
    title: 'Location',
    field: 'location',
    hidden: true,
  },
  {
    title: 'AWS account ID',
    field: 'awsAccountId',
    hidden: true,
    render: row => {
      return (
        row.awsAccountId && (
          <Account
            accountId={row.awsAccountId}
            accountUrl={row.awsAccountUrl}
          />
        )
      );
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
