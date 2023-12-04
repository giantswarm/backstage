import React from 'react';
import {
  EmptyState,
  StatusAborted,
  StatusError,
  StatusOK,
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
  getAppUpstreamVersion,
  statusDeployed,
  statusPendingInstall,
  statusPendingRollback,
  statusPendingUpgrade,
  statusSuperseded,
  statusUninstalled,
  statusUninstalling,
  statusUnknown,
} from '../../model/services/mapi/applicationv1alpha1';
import { useHelmReleases } from '../useHelmReleases';
import { IHelmRelease } from '../../model/services/mapi/helmv2beta1';
import {
  FulfilledRequestResult,
  RejectedRequestResult,
  RequestResult,
  Resource,
} from '../../apis';

type Deployment = IApp | IHelmRelease;

const formatStatus = (status: string) => {
  const label = status.replace(/-/g, ' ');

  switch (status) {
    case statusUnknown:
    case statusUninstalled:
      return <StatusAborted>{label}</StatusAborted>;

    case statusDeployed:
      return <StatusOK>{label}</StatusOK>;

    case statusSuperseded:
    case statusUninstalling:
    case statusPendingInstall:
    case statusPendingUpgrade:
    case statusPendingRollback:
      return <StatusWarning>{label}</StatusWarning>;

    default:
      return <StatusError>{label}</StatusError>;
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
    title: 'Installed As',
    field: 'installedAs',
    highlight: true,
  },
  {
    title: 'Type',
    field: 'deploymentType',
  },
  {
    title: 'Target Namespace',
    field: 'targetNamespace',
  },
  {
    title: 'Version',
    field: 'version',
  },
  {
    title: 'Upstream Version',
    field: 'upstreamVersion',
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
      installedAs: resource.metadata.name,
      targetNamespace: resource.spec.namespace,
      version: getAppCurrentVersion(resource),
      upstreamVersion: getAppUpstreamVersion(resource),
      status: formatStatus(getAppStatus(resource)),
    } : {
      installationName,
      deploymentType: 'HelmRelease',
      installedAs: resource.metadata.name,
      targetNamespace: resource.spec?.targetNamespace,
      version: resource.spec?.chart.spec.version,
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
