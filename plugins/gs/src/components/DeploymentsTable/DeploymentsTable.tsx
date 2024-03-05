import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Link,
  Table,
  TableColumn,
} from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import { useApps } from '../hooks';
import {
  IApp,
  getAppClusterName,
  getAppCurrentVersion,
  getAppStatus,
  getAppVersion,
  getAppChartName,
  getAppUpdatedTimestamp,
  getAppCatalogName,
} from '../../model/services/mapi/applicationv1alpha1';
import {
  IHelmRelease,
  getHelmReleaseStatus,
  getHelmReleaseClusterName,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseChartName,
  getHelmReleaseUpdatedTimestamp,
  getHelmReleaseSourceName,
} from '../../model/services/mapi/helmv2beta1';
import { useHelmReleases } from '../hooks';
import { Resource } from '../../apis';
import { useRouteRef } from '@backstage/core-plugin-api';
import { entityDeploymentsRouteRef } from '../../routes';
import { Version } from '../UI/Version';
import { formatAppCatalogName, formatVersion } from '../utils/helpers';
import { DeploymentActions } from '../DeploymentActions';
import { AppStatus } from '../AppStatus';
import { HelmReleaseStatus } from '../HelmReleaseStatus';
import DateComponent from '../UI/Date';
import { sortAndFilterOptions } from '../utils/tableHelpers';

type Deployment = IApp | IHelmRelease;

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
}

const generatedColumns: TableColumn<Row>[] = [
  {
    title: 'Namespace/Name',
    field: 'name',
    highlight: true,
    render: (row) => {
      const LinkWrapper = () => {
        const routeLink = useRouteRef(entityDeploymentsRouteRef);
        const searchParams = new URLSearchParams({
          pane: 'deploymentDetails',
          installation: row.installationName,
          kind: row.kind,
          namespace: row.namespace ?? '',
          name: row.name,
        });

        const to = `${routeLink()}?${searchParams.toString()}`;

        return (
          <Link
            component={RouterLink}
            to={to}
          >
            {row.namespace && (<Typography variant='inherit' noWrap>{row.namespace}/</Typography>)}
            <Typography variant='inherit' noWrap>{row.name}</Typography>
          </Link>
        );
      };

      return <LinkWrapper />;
    },
    ...sortAndFilterOptions((row) => `${row.namespace} / ${row.name}`),
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
    render: (row) => {
      const label = row.kind === 'app' ? 'App' : 'HelmRelease';

      return <Typography variant='inherit' noWrap>{label}</Typography>;
    },
  },
  {
    title: 'Source',
    field: 'source',
    render: (row) => {
      return (
        <>
          {row.sourceName && (<Typography variant='inherit' noWrap>{row.sourceName}/</Typography>)}
          {row.chartName && (<Typography variant='inherit' noWrap>{row.chartName}</Typography>)}
        </>
      );
    },
    ...sortAndFilterOptions((row) => `${row.sourceName} / ${row.chartName}`),
  },
  {
    title: 'Version',
    field: 'version',
    render: (row) => {
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
    render: (row) => (
      <DateComponent value={row.updated} relative />
    ),
  },
  {
    title: 'Status',
    field: 'status',
    render: (row) => {
      if (!row.status) {
        return 'n/a';
      }

      return row.kind === 'app'
        ? <AppStatus status={row.status} />
        : <HelmReleaseStatus status={row.status} />;
    },
    ...sortAndFilterOptions((row) => (row.status ?? '').replace(/-/g, ' ')),
  },
  {
    title: 'Actions',
    render: (row) => {
      return (
        <DeploymentActions
          installationName={row.installationName}
          clusterName={row.clusterName}
          kind={row.kind}
          name={row.name}
          namespace={row.namespace}
        />
      );
    },
    width: '24px',
  }
];

type Props = {
  loading: boolean;
  retry: () => void;
  resources: Resource<Deployment>[];
  sourceLocation?: string;
};

const DeploymentsTableView = ({
  loading,
  retry,
  resources,
  sourceLocation,
}: Props) => {
  const data: Row[] = resources.map(({installationName, ...resource}) => (
    resource.kind === 'App' ? {
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
    } : {
      installationName,
      kind: 'helmrelease',
      clusterName: getHelmReleaseClusterName(resource),
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      version: formatVersion(getHelmReleaseLastAppliedRevision(resource) ?? ''),
      attemptedVersion: formatVersion(getHelmReleaseLastAttemptedRevision(resource) ?? ''),
      status: getHelmReleaseStatus(resource),
      sourceLocation,
      updated: getHelmReleaseUpdatedTimestamp(resource),
      sourceName: getHelmReleaseSourceName(resource),
      chartName: getHelmReleaseChartName(resource),
    }
  ));

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
      title={
        <Typography variant="h6">Deployments</Typography>
      }
      columns={generatedColumns}
    />
  );
};

type DeploymentsTableProps = {
  deploymentNames: string[];
  sourceLocation?: string;
}

export const DeploymentsTable = ({
  deploymentNames,
  sourceLocation,
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
    ({ installationName, data }) => data.map((resource) => ({ installationName, ...resource }))
  );

  const loading = initialLoadingApps || initialLoadingHelmReleases;

  const handleRetry = () => {
    retryApps();
    retryHelmReleases();
  }

  const filteredResources = resources.filter((resource) => {
    const chartName = resource.kind === 'App'
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
    />
  );
};
