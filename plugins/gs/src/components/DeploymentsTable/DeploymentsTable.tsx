import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Link,
  StatusAborted,
  StatusError,
  StatusOK,
  StatusRunning,
  StatusWarning,
  Table,
  TableColumn,
} from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import { useApps } from '../useApps';
import {
  IApp,
  getAppClusterName,
  getAppCurrentVersion,
  getAppStatus,
  statusDeployed as appStatusDeployed,
  statusPendingInstall as appStatusPendingInstall,
  statusPendingRollback as appStatusPendingRollback,
  statusPendingUpgrade as appStatusPendingUpgrade,
  statusSuperseded as appStatusSuperseded,
  statusUninstalled as appStatusUninstalled,
  statusUninstalling as appStatusUninstalling,
  statusUnknown as appStatusUnknown,
  getAppVersion,
} from '../../model/services/mapi/applicationv1alpha1';
import {
  IHelmRelease,
  getHelmReleaseStatus,
  statusUnknown as helmReleaseStatusUnknown,
  statusReconciled as helmReleaseStatusReconciled,
  statusReconciling as helmReleaseStatusReconciling,
  statusStalled as helmReleaseStatusStalled,
  getHelmReleaseClusterName,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
} from '../../model/services/mapi/helmv2beta1';
import { useHelmReleases } from '../useHelmReleases';
import { Resource } from '../../apis';
import { useRouteRef } from '@backstage/core-plugin-api';
import { entityDeploymentsRouteRef } from '../../routes';
import { Version } from '../UI/Version';
import { formatVersion, toSentenceCase } from '../helpers';

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
          projectSlug={row.projectSlug}
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

      const statusLabel = toSentenceCase(row.status.replace(/-/g, ' '));

      switch (row.status) {
        case appStatusUnknown:
        case appStatusUninstalled:
        case helmReleaseStatusUnknown:
          return <StatusAborted>{statusLabel}</StatusAborted>;
    
        case appStatusSuperseded:
        case appStatusUninstalling:
        case appStatusPendingInstall:
        case appStatusPendingUpgrade:
        case appStatusPendingRollback:
        case helmReleaseStatusStalled:
          return <StatusWarning>{statusLabel}</StatusWarning>;
    
        case helmReleaseStatusReconciling:
          return <StatusRunning>{statusLabel}</StatusRunning>;
    
        case appStatusDeployed:
        case helmReleaseStatusReconciled:
          return <StatusOK>{statusLabel}</StatusOK>;
    
        default:
          return <StatusError>{statusLabel}</StatusError>;
      }
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
  projectSlug?: string;
};

const DeploymentsTableView = ({
  loading,
  retry,
  resources,
  projectSlug,
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
      projectSlug,
    } : {
      installationName,
      kind: 'helmrelease',
      clusterName: getHelmReleaseClusterName(resource),
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      version: formatVersion(getHelmReleaseLastAppliedRevision(resource) ?? ''),
      attemptedVersion: formatVersion(getHelmReleaseLastAttemptedRevision(resource) ?? ''),
      status: getHelmReleaseStatus(resource),
      projectSlug,
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
  serviceName: string;
  projectSlug?: string;
}

export const DeploymentsTable = ({
  serviceName,
  projectSlug,
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

  const filteredResources = resources.filter((resource) => resource.kind === 'App'
    ? resource.spec.name === serviceName
    : resource.spec?.chart.spec.chart === serviceName
  );

  return (
    <DeploymentsTableView
      loading={loading}
      resources={filteredResources}
      retry={handleRetry}
      projectSlug={projectSlug}
    />
  );
};
