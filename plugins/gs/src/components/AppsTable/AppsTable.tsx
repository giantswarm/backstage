import React from 'react';
import { EmptyState, Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Grid, Typography } from '@material-ui/core';
import { RejectedResults } from '../RejectedResults';
import { FulfilledRequestResult, RejectedRequestResult, useApps } from '../useApps';
import { IApp, getAppClusterName, getAppCurrentVersion, getAppStatus, getAppUpstreamVersion } from '../../model/services/mapi/applicationv1alpha1';
import { useHelmReleases } from '../useHelmReleases';
import { IHelmRelease } from '../../model/services/mapi/helmv2beta1';

type Resource<T> = T & {
  installationName: string;
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
  resources: Resource<IApp | IHelmRelease>[];
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
      status: getAppStatus(resource),
    } : {
      installationName,
      deploymentType: 'HelmRelease',
      installedAs: resource.metadata.name,
      targetNamespace: resource.spec?.targetNamespace,
      version: resource.spec?.chart.spec.version,
    }
  ));

  const title = `Deployments`

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
        <Typography variant="h6">{title}</Typography>
      }
      columns={generatedColumns}
    />
  );
};

type AppsTableProps = {
  installations: string[];
  serviceName: string;
}

export const AppsTable = ({ installations, serviceName }: AppsTableProps) => {
  // const [{ value: results, ...tableProps }, { retry }] = useApps({ installations });

  // const noInstallationsSelected = installations.length === 0;
  // const fulfilledResults = results?.filter(
  //   (result): result is FulfilledRequestResult<IApp> => result.status === 'fulfilled'
  // ) || [];
  // const rejectedResults = results?.filter(
  //   (result): result is RejectedRequestResult => result.status === 'rejected'
  // ) || [];

  // const resources: Resource<IApp>[] = fulfilledResults.flatMap((result) => result.value.map((item) => ({
  //   installationName: result.installationName,
  //   ...item
  // })));

  // const filteredResources = resources.filter((resource) => resource.spec.name === appName);

  const [{ value: results, ...tableProps }, { retry }] = useHelmReleases({ installations });

  const noInstallationsSelected = installations.length === 0;
  const fulfilledResults = results?.filter(
    (result): result is FulfilledRequestResult<IHelmRelease> => result.status === 'fulfilled'
  ) || [];
  const rejectedResults = results?.filter(
    (result): result is RejectedRequestResult => result.status === 'rejected'
  ) || [];

  const resources: Resource<IHelmRelease>[] = fulfilledResults.flatMap((result) => result.value.map((item) => ({
    installationName: result.installationName,
    ...item
  })));

  const filteredResources = resources.filter((resource) => resource.spec?.chart.spec.chart === serviceName);

  return noInstallationsSelected ? (
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
          {...tableProps}
          resources={filteredResources}
          retry={retry}
        />
      </Grid>
    </Grid>
  );
};
