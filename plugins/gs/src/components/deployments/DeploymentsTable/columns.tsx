import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { RouteRef, useRouteRef } from '@backstage/core-plugin-api';
import { DEPLOYMENT_DETAILS_PANE_ID, useDetailsPane } from '../../hooks';
import { sortAndFilterOptions } from '../../utils/tableHelpers';
import { DateComponent, Version } from '../../UI';
import { AppStatus } from '../AppStatus';
import { HelmReleaseStatus } from '../HelmReleaseStatus';
import { Typography } from '@material-ui/core';
import { DeploymentActions } from '../DeploymentActions';
import { clusterDetailsRouteRef } from '../../../routes';
import { formatSource } from '../../utils/helpers';

export type Row = {
  installationName: string;
  kind: string;
  clusterName?: string;
  clusterNamespace?: string;
  name: string;
  namespace?: string;
  version: string;
  attemptedVersion: string;
  status?: string;
  sourceLocation?: string;
  updated?: string;
  sourceKind?: string;
  sourceName?: string;
  chartName?: string;
  apiVersion: string;
};

export const getInitialColumns = (
  baseRouteRef: RouteRef,
  grafanaDashboard?: string,
  ingressHost?: string,
): TableColumn<Row>[] => {
  const columns: TableColumn<Row>[] = [
    {
      title: 'Name',
      field: 'name',
      highlight: true,
      render: row => {
        const LinkWrapper = () => {
          const { getRoute } = useDetailsPane(DEPLOYMENT_DETAILS_PANE_ID);
          const baseRoute = useRouteRef(baseRouteRef);
          const to = getRoute(baseRoute(), {
            installationName: row.installationName,
            apiVersion: row.apiVersion,
            kind: row.kind,
            namespace: row.namespace,
            name: row.name,
          });

          return (
            <Link component={RouterLink} to={to}>
              <Typography variant="inherit" noWrap>
                {row.name}
              </Typography>
            </Link>
          );
        };

        return <LinkWrapper />;
      },
    },
    {
      title: 'Installation',
      field: 'installationName',
    },
    {
      title: 'Cluster',
      field: 'clusterName',
      render: row => {
        if (row.clusterName && row.clusterNamespace) {
          const LinkWrapper = () => {
            const routeLink = useRouteRef(clusterDetailsRouteRef);

            return (
              <Link
                component={RouterLink}
                to={routeLink({
                  installationName: row.installationName,
                  namespace: row.clusterNamespace!,
                  name: row.clusterName!,
                })}
              >
                {row.clusterName}
              </Link>
            );
          };

          return <LinkWrapper />;
        }

        return row.clusterName;
      },
    },
    {
      title: 'Namespace',
      field: 'namespace',
    },
    {
      title: 'Type',
      field: 'kind',
      render: row => {
        const label = row.kind === 'app' ? 'App' : 'HelmRelease';

        return (
          <Typography variant="inherit" noWrap>
            {label}
          </Typography>
        );
      },
    },
    {
      title: 'Source',
      field: 'source',
      hidden: true,
      render: row => {
        return (
          <Typography variant="inherit" noWrap>
            {formatSource(row.sourceKind, row.sourceName)}
          </Typography>
        );
      },
      ...sortAndFilterOptions(row => `${row.sourceKind} ${row.sourceName}`),
    },
    {
      title: 'Chart Name',
      field: 'chartName',
      hidden: true,
      render: row => {
        return (
          <Typography variant="inherit" noWrap>
            {row.chartName}
          </Typography>
        );
      },
    },
    {
      title: 'Version',
      field: 'version',
      render: row => {
        return (
          <Version
            version={row.version}
            sourceLocation={row.sourceLocation}
            highlight
            displayWarning={row.version !== row.attemptedVersion}
            warningMessageVersion={row.attemptedVersion}
          />
        );
      },
    },
    {
      title: 'Updated',
      field: 'updated',
      type: 'datetime',
      render: row => <DateComponent value={row.updated} relative />,
    },
    {
      title: 'Status',
      field: 'status',
      render: row => {
        if (!row.status) {
          return 'n/a';
        }

        return row.kind === 'app' ? (
          <AppStatus status={row.status} />
        ) : (
          <HelmReleaseStatus status={row.status} />
        );
      },
      ...sortAndFilterOptions(row => (row.status ?? '').replace(/-/g, ' ')),
    },
  ];

  if (ingressHost || grafanaDashboard) {
    columns.push({
      title: 'Actions',
      render: row => {
        return (
          <DeploymentActions
            installationName={row.installationName}
            clusterName={row.clusterName}
            kind={row.kind}
            name={row.name}
            namespace={row.namespace}
            grafanaDashboard={grafanaDashboard}
            ingressHost={ingressHost}
          />
        );
      },
      width: '24px',
    });
  }

  return columns;
};
