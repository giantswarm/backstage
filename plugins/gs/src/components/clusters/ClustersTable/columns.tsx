import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Link, SubvalueCell, TableColumn } from '@backstage/core-components';
import { clusterDetailsRouteRef } from '../../../routes';
import { sortAndFilterOptions } from '../../utils/tableHelpers';
import { toSentenceCase } from '../../utils/helpers';
import { DateComponent, Version } from '../../UI';
import { ClusterStatus } from '../ClusterStatus';
import { ClusterTypes } from '../utils';
import { Box, Tooltip } from '@material-ui/core';
import {
  ClusterTypeManagementIcon,
  ClusterTypeWorkloadIcon,
} from '../../../assets/icons/CustomIcons';

export type Row = {
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
  appVersion?: string;
  releaseVersion?: string;
  location?: string;
  awsAccountId?: string;
};

export const getInitialColumns = (): TableColumn<Row>[] => [
  {
    title: 'Type',
    field: 'type',
    width: 'auto',
    render: row => {
      if (row.type === ClusterTypes.Management) {
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
  },
  {
    title: 'Cluster App',
    field: 'appVersion',
    render: row => {
      return (
        <Version
          version={row.appVersion || ''}
          highlight
          sourceLocation="https://github.com/giantswarm/cluster"
          displayWarning={false}
        />
      );
    },
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
