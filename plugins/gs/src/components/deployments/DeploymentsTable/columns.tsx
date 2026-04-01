import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Link, TableColumn } from '@backstage/core-components';
import { RouteRef, useRouteRef } from '@backstage/frontend-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  isTableColumnHidden,
  semverCompareSort,
  sortAndFilterOptions,
} from '@giantswarm/backstage-plugin-ui-react';
import { DateComponent, NotAvailable, Version } from '../../UI';
import { Box, Typography } from '@material-ui/core';
import { DeploymentActions } from '../DeploymentActions';
import {
  clusterDetailsRouteRef,
  deploymentDetailsRouteRef,
} from '../../../routes';
import { formatSource } from '../../utils/helpers';
import { renderClusterType } from '../../clusters/ClustersTable/columns';
import { DeploymentData } from '../DeploymentsDataProvider';
import { DeploymentStatus } from '../DeploymentStatus';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useDetailsPane } from '@giantswarm/backstage-plugin-ui-react';
import { WORKLOAD_DETAILS_PANE_ID } from '../WorkloadDetailsPane';

const KIND_LABELS: Record<string, string> = {
  app: 'App',
  helmrelease: 'HelmRelease',
  deployment: 'Deployment',
  statefulset: 'StatefulSet',
  daemonset: 'DaemonSet',
};

const NATIVE_WORKLOAD_KINDS = new Set([
  'deployment',
  'statefulset',
  'daemonset',
]);

export const DeploymentColumns = {
  app: 'entityRef',
  name: 'name',
  installationName: 'installationName',
  clusterName: 'clusterName',
  clusterType: 'clusterType',
  namespace: 'namespace',
  kind: 'kind',
  source: 'source',
  chartName: 'chartName',
  version: 'version',
  replicas: 'replicas',
  updated: 'updated',
  status: 'status',
} as const;

export const getInitialColumns = ({
  visibleColumns,
  context = 'deployments-page',
  grafanaDashboard,
  ingressHost,
  sourceLocation,
}: {
  visibleColumns: string[];
  context?: 'catalog-entity' | 'deployments-page' | 'cluster-apps';
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
        if (NATIVE_WORKLOAD_KINDS.has(row.kind)) {
          const WorkloadLinkWrapper = () => {
            const location = useLocation();
            const { getRoute } = useDetailsPane(WORKLOAD_DETAILS_PANE_ID);
            const to = getRoute(location.pathname, {
              cluster: row.installationName,
              clusterName: row.clusterName,
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

          return <WorkloadLinkWrapper />;
        }

        const LinkWrapper = () => {
          const routeLink = useRouteRef(deploymentDetailsRouteRef)!;
          return (
            <Link
              component={RouterLink}
              to={routeLink({
                installationName: row.installationName,
                kind: row.kind,
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

        return <LinkWrapper />;
      },
    },
    {
      title: 'App',
      field: DeploymentColumns.app,
      hidden: context === 'catalog-entity',
      render: row => {
        return row.entity ? (
          <EntityRefLink entityRef={row.entity} />
        ) : (
          <NotAvailable />
        );
      },
      ...sortAndFilterOptions(row =>
        row.entity ? stringifyEntityRef(row.entity) : '',
      ),
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
            const routeLink = useRouteRef(clusterDetailsRouteRef)!;

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
        const label = KIND_LABELS[row.kind] ?? row.kind;

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
        if (!row.version) {
          return <NotAvailable />;
        }

        if (NATIVE_WORKLOAD_KINDS.has(row.kind)) {
          return (
            <Typography variant="inherit" noWrap>
              {row.version}
            </Typography>
          );
        }

        return (
          <Box maxWidth={200}>
            <Version
              version={row.version}
              sourceLocation={sourceLocation}
              highlight
              displayWarning={row.version !== row.attemptedVersion}
              warningMessageVersion={row.attemptedVersion}
            />
          </Box>
        );
      },
      customSort: semverCompareSort(row => row.version),
    },
    {
      title: 'Replicas',
      field: DeploymentColumns.replicas,
      hidden: true,
      render: row => {
        if (!row.replicaStatus) {
          return <NotAvailable />;
        }

        return (
          <Typography variant="inherit" noWrap>
            {row.replicaStatus.ready}/{row.replicaStatus.desired}
          </Typography>
        );
      },
      ...sortAndFilterOptions(row =>
        row.replicaStatus
          ? `${row.replicaStatus.ready}/${row.replicaStatus.desired}`
          : '',
      ),
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
          return <NotAvailable />;
        }

        return <DeploymentStatus status={row.status} />;
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

  const clusterAppsExcludedFields: string[] = [
    DeploymentColumns.installationName,
    DeploymentColumns.clusterName,
    DeploymentColumns.clusterType,
  ];

  const filteredColumns =
    context === 'cluster-apps'
      ? columns.filter(
          column => !clusterAppsExcludedFields.includes(column.field as string),
        )
      : columns;

  return filteredColumns.map(column => ({
    ...column,
    hidden: isTableColumnHidden(column.field, {
      defaultValue: Boolean(column.hidden),
      visibleColumns,
    }),
  }));
};
