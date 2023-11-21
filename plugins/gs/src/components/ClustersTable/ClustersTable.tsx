import React from 'react';
import { EmptyState, Table, TableColumn } from '@backstage/core-components';
import { FulfilledClustersResult, RejectedClustersResult, useClusters } from '../useClusters';
import SyncIcon from '@material-ui/icons/Sync';
import { Grid, Typography } from '@material-ui/core';
import { RejectedResults } from '../RejectedResults';

const generatedColumns: TableColumn[] = [
  {
    title: 'Installation',
    field: 'installationName',
    width: '200px',
  },
  {
    title: 'Name',
    field: 'name',
    highlight: true,
  },
  {
    title: 'Namespace',
    field: 'namespace',
  },
  {
    title: 'Description',
    field: 'description'
  },
];

type Props = {
  loading: boolean;
  retry: () => void;
  clustersResults: FulfilledClustersResult[];
};

const ClustersTableView = ({
  loading,
  retry,
  clustersResults,
}: Props) => {
  const data = clustersResults.flatMap(({ installationName, value: clusters }) => clusters.map((cluster) => (
    {
      installationName,
      name: cluster.metadata.name,
      namespace: cluster.metadata.namespace,
      description: cluster.metadata.annotations?.['cluster.giantswarm.io/description']
    }
  )));

  const title = `Clusters`

  return (
    <Table
      isLoading={loading}
      options={{ paging: false }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload clusters',
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

type ClustersTableProps = {
  installations: string[];
}

export const ClustersTable = ({ installations }: ClustersTableProps) => {
  const [{ clustersResults, ...tableProps }, { retry }] = useClusters({ installations });

  const hasNoClusters =  installations.length === 0;
  const fulfilledResults = clustersResults?.filter(
    (result): result is FulfilledClustersResult => result.status === 'fulfilled'
  ) || [];
  const rejectedResults = clustersResults?.filter(
    (result): result is RejectedClustersResult => result.status === 'rejected'
  ) || [];

  return hasNoClusters ? (
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
        <ClustersTableView
          {...tableProps}
          clustersResults={fulfilledResults}
          retry={retry}
        />
      </Grid>
    </Grid>
  );
};
