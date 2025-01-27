import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Link, SubvalueCell, TableColumn } from '@backstage/core-components';
import { clusterDetailsRouteRef } from '../../../routes';
import { sortAndFilterOptions } from '../../utils/tableHelpers';
import { toSentenceCase } from '../../utils/helpers';
import { DateComponent } from '../../UI';
import { ClusterStatus } from '../ClusterStatus';

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
  location?: string;
};

export const getInitialColumns = (): TableColumn<Row>[] => [
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
    title: 'Type',
    field: 'type',
    render: row => toSentenceCase(row.type),
  },
  {
    title: 'Organization',
    field: 'organization',
  },
  {
    title: 'Location',
    field: 'location',
  },
  {
    title: 'AWS account ID',
    field: 'awsAccountId',
    hidden: true,
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
