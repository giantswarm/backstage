import React from 'react';
import {
  EmptyState,
  StatusAborted,
  StatusError,
  StatusOK,
  StatusRunning,
  StatusWarning,
  Table,
  TableColumn,
} from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Grid, Typography } from '@material-ui/core';
import { RejectedResults } from '../RejectedResults';
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
} from '../../model/services/mapi/applicationv1alpha1';
import {
  IHelmRelease,
  getHelmReleaseStatus,
  getHelmReleaseVersion,
  statusUnknown as helmReleaseStatusUnknown,
  statusReconciled as helmReleaseStatusReconciled,
  statusReconciling as helmReleaseStatusReconciling,
  statusStalled as helmReleaseStatusStalled,
  getHelmReleaseClusterName,
} from '../../model/services/mapi/helmv2beta1';
import { useHelmReleases } from '../useHelmReleases';
import {
  FulfilledRequestResult,
  RejectedRequestResult,
  RequestResult,
  Resource,
} from '../../apis';

type Deployment = IApp | IHelmRelease;

const formatAppStatus = (status: string) => {
  if (status === '') {
    return 'n/a';
  }

  const label = status.replace(/-/g, ' ');

  switch (status) {
    case appStatusUnknown:
    case appStatusUninstalled:
      return <StatusAborted>{label}</StatusAborted>;

    case appStatusDeployed:
      return <StatusOK>{label}</StatusOK>;

    case appStatusSuperseded:
    case appStatusUninstalling:
    case appStatusPendingInstall:
    case appStatusPendingUpgrade:
    case appStatusPendingRollback:
      return <StatusWarning>{label}</StatusWarning>;

    default:
      return <StatusError>{label}</StatusError>;
  }
}

const formatHelmReleaseStatus = (status: string) => {
  if (status === '') {
    return 'n/a';
  }

  switch (status) {
    case helmReleaseStatusUnknown:
      return <StatusAborted>{status}</StatusAborted>;

    case helmReleaseStatusStalled:
      return <StatusWarning>{status}</StatusWarning>;

    case helmReleaseStatusReconciling:
      return <StatusRunning>{status}</StatusRunning>;

    case helmReleaseStatusReconciled:
      return <StatusOK>{status}</StatusOK>;

    default:
      return <StatusError>{status}</StatusError>;
  }
}

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
    field: 'deploymentType',
  },
  {
    title: 'Resource Name',
    field: 'name',
    highlight: true,
  },
  {
    title: 'Namespace',
    field: 'namespace',
  },
  {
    title: 'Version',
    field: 'version',
  },
  {
    title: 'Status',
    field: 'status',
  },
];

type Props = {
  loading: boolean;
  retry: () => void;
  resources: Resource<Deployment>[];
};

const DeploymentsTableView = ({
  loading,
  retry,
  resources,
}: Props) => {
  const data = resources.map(({installationName, ...resource}) => (
    resource.kind === 'App' ? {
      installationName,
      deploymentType: 'App',
      clusterName: getAppClusterName(resource),
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      version: getAppCurrentVersion(resource),
      status: formatAppStatus(getAppStatus(resource)),
    } : {
      installationName,
      deploymentType: 'HelmRelease',
      clusterName: getHelmReleaseClusterName(resource),
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      version: getHelmReleaseVersion(resource),
      status: formatHelmReleaseStatus(getHelmReleaseStatus(resource)),
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
  installations: string[];
  serviceName: string;
}

export const DeploymentsTable = ({ installations, serviceName }: DeploymentsTableProps) => {
  const [
    {
      value: resultsApps = [],
      loading: loadingApps,
    },
    {
      retry: retryApps,
    },
  ] = useApps({ installations });

  const [
    {
      value: resultsHelmReleases = [],
      loading: loadingHelmReleases,
    },
    {
      retry: retryHelmReleases,
    },
  ] = useHelmReleases({ installations });

  const loading = loadingApps || loadingHelmReleases;

  const handleRetry = () => {
    retryApps();
    retryHelmReleases();
  }

  const results: RequestResult<Deployment>[] = [
    ...resultsApps,
    ...resultsHelmReleases,
  ];
  const fulfilledResults = results?.filter(
    (result): result is FulfilledRequestResult<Deployment> => result.status === 'fulfilled'
  );
  const rejectedResults = results?.filter(
    (result): result is RejectedRequestResult => result.status === 'rejected'
  );

  const resources: Resource<Deployment>[] = fulfilledResults.flatMap((result) => result.value.map((item) => ({
    installationName: result.installationName,
    ...item
  })));

  const filteredResources = resources.filter((resource) => resource.kind === 'App'
    ? resource.spec.name === serviceName
    : resource.spec?.chart.spec.chart === serviceName
  );

  return installations.length === 0 ? (
    <EmptyState
      missing="data"
      title="No Installations Selected"
      description="Please select one or more installations."
    />
  ) : (
    <Grid container spacing={3} direction="column">
      {rejectedResults.length > 0 && (
        <Grid item>
          <RejectedResults results={rejectedResults} />
        </Grid>
      )}
      <Grid item>
        <DeploymentsTableView
          loading={loading}
          resources={filteredResources}
          retry={handleRetry}
        />
      </Grid>
    </Grid>
  );
};
