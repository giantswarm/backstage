import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Link, Table, TableColumn } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import type {
  Deployment,
  Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  getAppClusterName,
  getAppCurrentVersion,
  getAppStatus,
  getAppVersion,
  getAppChartName,
  getAppUpdatedTimestamp,
  getAppCatalogName,
  getHelmReleaseStatus,
  getHelmReleaseClusterName,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseChartName,
  getHelmReleaseUpdatedTimestamp,
  getHelmReleaseSourceName,
} from '@giantswarm/backstage-plugin-gs-common';
import { entityDeploymentsRouteRef } from '../../../routes';
import {
  useApps,
  useHelmReleases,
  DEPLOYMENT_DETAILS_PANE_ID,
  useDetailsPane,
} from '../../hooks';
import { formatAppCatalogName, formatVersion } from '../../utils/helpers';
import { sortAndFilterOptions } from '../../utils/tableHelpers';
import { DateComponent, Version } from '../../UI';
import { AppStatus } from '../AppStatus';
import { HelmReleaseStatus } from '../HelmReleaseStatus';
import { DeploymentActions } from '../DeploymentActions';

type Row = {
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

const generatedColumns: TableColumn<Row>[] = [
  {
    title: 'Namespace/Name',
    field: 'name',
    highlight: true,
    render: row => {
      const LinkWrapper = () => {
        const { getRoute } = useDetailsPane(DEPLOYMENT_DETAILS_PANE_ID);
        const baseRoute = useRouteRef(entityDeploymentsRouteRef);
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

type Props = {
  loading: boolean;
  retry: () => void;
  resources: Resource<Deployment>[];
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

const DeploymentsTableView = ({
  loading,
  retry,
  resources,
  sourceLocation,
  grafanaDashboard,
  ingressHost,
}: Props) => {
  const data: Row[] = resources.map(({ installationName, ...resource }) =>
    resource.kind === 'App'
      ? {
          installationName,
          kind: 'app',
          clusterName: getAppClusterName(resource),
          name: resource.metadata.name,
          namespace: resource.metadata.namespace,
          version: formatVersion(getAppCurrentVersion(resource) ?? ''),
          attemptedVersion: formatVersion(getAppVersion(resource)),
          status: getAppStatus(resource),
          sourceLocation,
          updated: getAppUpdatedTimestamp(resource),
          sourceName: formatAppCatalogName(getAppCatalogName(resource)),
          chartName: getAppChartName(resource),
          apiVersion: resource.apiVersion,
        }
      : {
          installationName,
          kind: 'helmrelease',
          clusterName: getHelmReleaseClusterName(resource),
          name: resource.metadata.name,
          namespace: resource.metadata.namespace,
          version: formatVersion(
            getHelmReleaseLastAppliedRevision(resource) ?? '',
          ),
          attemptedVersion: formatVersion(
            getHelmReleaseLastAttemptedRevision(resource) ?? '',
          ),
          status: getHelmReleaseStatus(resource),
          sourceLocation,
          updated: getHelmReleaseUpdatedTimestamp(resource),
          sourceName: getHelmReleaseSourceName(resource),
          chartName: getHelmReleaseChartName(resource),
          apiVersion: resource.apiVersion,
        },
  );

  const columns: TableColumn<Row>[] =
    ingressHost || grafanaDashboard
      ? [
          ...generatedColumns,
          {
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
          },
        ]
      : generatedColumns;

  return (
    <Table<Row>
      isLoading={loading}
      options={{
        pageSize: 20,
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload deployments',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={data}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Deployments</Typography>}
      columns={columns}
    />
  );
};

type DeploymentsTableProps = {
  deploymentNames: string[];
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

export const DeploymentsTable = ({
  deploymentNames,
  sourceLocation,
  grafanaDashboard,
  ingressHost,
}: DeploymentsTableProps) => {
  const {
    installationsData: installationsDataApps,
    initialLoading: initialLoadingApps,
    retry: retryApps,
  } = useApps();

  const {
    installationsData: installationsDataHelmReleases,
    initialLoading: initialLoadingHelmReleases,
    retry: retryHelmReleases,
  } = useHelmReleases();

  const installationsData = [
    ...installationsDataApps,
    ...installationsDataHelmReleases,
  ];

  const resources: Resource<Deployment>[] = installationsData.flatMap(
    ({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
  );

  const loading = initialLoadingApps || initialLoadingHelmReleases;

  const handleRetry = () => {
    retryApps();
    retryHelmReleases();
  };

  const filteredResources = resources.filter(resource => {
    const chartName =
      resource.kind === 'App'
        ? getAppChartName(resource)
        : getHelmReleaseChartName(resource);

    return chartName && deploymentNames.includes(chartName);
  });

  return (
    <DeploymentsTableView
      loading={loading}
      resources={filteredResources}
      retry={handleRetry}
      sourceLocation={sourceLocation}
      grafanaDashboard={grafanaDashboard}
      ingressHost={ingressHost}
    />
  );
};
