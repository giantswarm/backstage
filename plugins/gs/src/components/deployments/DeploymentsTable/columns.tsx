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

export type Row = {
  installationName: string;
  kind: string;
  clusterName?: string;
  name: string;
  namespace?: string;
  version: string;
  attemptedVersion: string;
  status?: string;
  sourceLocation?: string;
  updated?: string;
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
      title: 'Namespace/Name',
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
              {row.namespace && (
                <Typography variant="inherit" noWrap>
                  {row.namespace}/
                </Typography>
              )}
              <Typography variant="inherit" noWrap>
                {row.name}
              </Typography>
            </Link>
          );
        };

        return <LinkWrapper />;
      },
      ...sortAndFilterOptions(row => `${row.namespace} / ${row.name}`),
    },
    {
      title: 'Installation',
      field: 'installationName',
    },
    {
      title: 'Cluster',
      field: 'clusterName',
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
      render: row => {
        return (
          <>
            {row.sourceName && (
              <Typography variant="inherit" noWrap>
                {row.sourceName}/
              </Typography>
            )}
            {row.chartName && (
              <Typography variant="inherit" noWrap>
                {row.chartName}
              </Typography>
            )}
          </>
        );
      },
      ...sortAndFilterOptions(row => `${row.sourceName} / ${row.chartName}`),
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
