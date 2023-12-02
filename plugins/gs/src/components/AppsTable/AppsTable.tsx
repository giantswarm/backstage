import React from 'react';
import { EmptyState, Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Grid, Typography } from '@material-ui/core';
import { RejectedResults } from '../RejectedResults';
import { FulfilledRequestResult, RejectedRequestResult, useApps } from '../useApps';
import { IApp, getAppClusterName, getAppCurrentVersion, getAppStatus, getAppUpstreamVersion } from '../../model/services/mapi/applicationv1alpha1';

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
  resources: Resource<IApp>[];
};

const AppsTableView = ({
  loading,
  retry,
  resources,
}: Props) => {
  const data = resources.map(({installationName, ...app}) => (
    {
      installationName,
      clusterName: getAppClusterName(app),
      installedAs: app.metadata.name,
      targetNamespace: app.spec.namespace,
      version: getAppCurrentVersion(app),
      upstreamVersion: getAppUpstreamVersion(app),
      status: getAppStatus(app),
    }
  ));

  const title = `Apps`

  return (
    <Table
      isLoading={loading}
      options={{ paging: false }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload apps',
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
  appName: string;
}

export const AppsTable = ({ installations, appName }: AppsTableProps) => {
  const [{ value: results, ...tableProps }, { retry }] = useApps({ installations });

  const hasNoApps = installations.length === 0;
  const fulfilledResults = results?.filter(
    (result): result is FulfilledRequestResult<IApp> => result.status === 'fulfilled'
  ) || [];
  const rejectedResults = results?.filter(
    (result): result is RejectedRequestResult => result.status === 'rejected'
  ) || [];

  const appResources: Resource<IApp>[] = fulfilledResults.flatMap((result) => result.value.map((item) => ({
    installationName: result.installationName,
    ...item
  })));

  const filteredResources = appResources.filter((appResource) => appResource.spec.name === appName);

  return hasNoApps ? (
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
        <AppsTableView
          {...tableProps}
          resources={filteredResources}
          retry={retry}
        />
      </Grid>
    </Grid>
  );
};
