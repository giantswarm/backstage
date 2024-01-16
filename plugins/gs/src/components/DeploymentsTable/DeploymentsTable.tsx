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
} from '../../model/services/mapi/applicationv1alpha1';
import {
  IHelmRelease,
  getHelmReleaseStatus,
  getHelmReleaseClusterName,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseChartName,
} from '../../model/services/mapi/helmv2beta1';
import { useHelmReleases } from '../hooks';
import { Resource } from '../../apis';
import { useRouteRef } from '@backstage/core-plugin-api';
import { entityDeploymentsRouteRef } from '../../routes';
import { Version } from '../UI/Version';
import { formatVersion } from '../utils/helpers';
import { DeploymentStatus } from '../DeploymentStatus';

type Deployment = IApp | IHelmRelease;

const generatedColumns: TableColumn[] = [
  {
    title: 'Installation',
    field: 'installationName',
    width: '200px',
  },
  {
    title: 'Cluster',
    field: 'clusterName',
  },
  {
    title: 'Type',
    field: 'kind',
    render: (row: any): React.ReactNode => {
      return row.kind === 'app' ? 'App' : 'HelmRelease';
    }
  },
  {
    title: 'Resource Name',
    field: 'name',
    highlight: true,
    render: (row: any): React.ReactNode => {
      const LinkWrapper = () => {
        const routeLink = useRouteRef(entityDeploymentsRouteRef);
        const searchParams = new URLSearchParams({
          pane: 'deploymentDetails',
          installation: row.installationName,
          kind: row.kind,
          namespace: row.namespace,
          name: row.name,
        });

        const to = `${routeLink()}?${searchParams.toString()}`;

        return (
          <Link
            component={RouterLink}
            to={to}
          >
            {row.name}
          </Link>
        );
      };

      return <LinkWrapper />;
    },
  },
  {
    title: 'Version',
    field: 'version',
    render: (row: any): React.ReactNode => {
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
    title: 'Status',
    field: 'status',
    render: (row: any): React.ReactNode => {
      if (row.status === '') {
        return 'n/a';
      }

      return <DeploymentStatus status={row.status} />;
    },
    customFilterAndSearch: (
      query,
      row: any,
    ) => {
      const statusLabel = row.status.replace(/-/g, ' ');
      return `${row.status} ${statusLabel}`
      .toLocaleUpperCase('en-US')
      .includes(query.toLocaleUpperCase('en-US'));
    }
  },
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
  const data = resources.map(({installationName, ...resource}) => (
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
    }
  ));

  return (
    <Table
      isLoading={loading}
      options={{ paging: false }}
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
