import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { RouteRef, useRouteRef } from '@backstage/core-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { DEPLOYMENT_DETAILS_PANE_ID, useDetailsPane } from '../../hooks';
import {
  semverCompareSort,
  sortAndFilterOptions,
} from '../../utils/tableHelpers';
import { DateComponent, NotAvailable, Version } from '../../UI';
import { AppStatus } from '../AppStatus';
import { HelmReleaseStatus } from '../HelmReleaseStatus';
import { Typography } from '@material-ui/core';
import { DeploymentActions } from '../DeploymentActions';
import { clusterDetailsRouteRef } from '../../../routes';
import { formatSource } from '../../utils/helpers';
import { renderClusterType } from '../../clusters/ClustersTable/columns';
import { DeploymentData } from '../DeploymentsDataProvider';

export const DeploymentColumns = {
  name: 'name',
  installationName: 'installationName',
  clusterName: 'clusterName',
  clusterType: 'clusterType',
  namespace: 'namespace',
  kind: 'kind',
  source: 'source',
  chartName: 'chartName',
  version: 'version',
  updated: 'updated',
  status: 'status',
} as const;

export const getInitialColumns = ({
  context = 'deployments-page',
  baseRouteRef,
  grafanaDashboard,
  ingressHost,
  sourceLocation,
}: {
  context?: 'catalog-entity' | 'deployments-page';
  baseRouteRef: RouteRef;
  grafanaDashboard?: string;
  ingressHost?: string;
  sourceLocation?: string;
}): TableColumn<DeploymentData>[] => {
  const columns: TableColumn<DeploymentData>[] = [
    {
      title: 'Name',
      field: DeploymentColumns.name,
      highlight: true,
      defaultSort: 'asc',
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
      title: 'App',
      field: 'entityRef',
      hidden: context === 'catalog-entity',
      render: row => {
        return row.entityRef ? (
          <EntityRefLink entityRef={row.entityRef} />
        ) : (
          <NotAvailable />
        );
      },
      cellStyle: {
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      },
    },
    {
      title: 'Installation',
      field: DeploymentColumns.installationName,
    },
    {
      title: 'Cluster',
      field: DeploymentColumns.clusterName,
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
      title: 'Cluster Type',
      field: DeploymentColumns.clusterType,
      hidden: true,
      render: row => {
        return row.clusterType ? renderClusterType(row.clusterType) : undefined;
      },
    },
    {
      title: 'Namespace',
      field: DeploymentColumns.namespace,
    },
    {
      title: 'Type',
      field: DeploymentColumns.kind,
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
      field: DeploymentColumns.source,
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
      field: DeploymentColumns.chartName,
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
      field: DeploymentColumns.version,
      render: row => {
        return (
          <Version
            version={row.version}
            sourceLocation={sourceLocation}
            highlight
            displayWarning={row.version !== row.attemptedVersion}
            warningMessageVersion={row.attemptedVersion}
          />
        );
      },
      customSort: semverCompareSort(row => row.version),
    },
    {
      title: 'Updated',
      field: DeploymentColumns.updated,
      type: 'datetime',
      render: row => <DateComponent value={row.updated} relative />,
    },
    {
      title: 'Status',
      field: DeploymentColumns.status,
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
