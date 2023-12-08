import React from 'react';
import { EmptyState, SubvalueCell, Table, TableColumn } from '@backstage/core-components';
import { useClusters } from '../useClusters';
import SyncIcon from '@material-ui/icons/Sync';
import { Grid, Typography } from '@material-ui/core';
import { Resource } from '../../apis';
import { ICluster } from '../../model/services/mapi/capiv1beta1';

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
    render: (row: any): React.ReactNode => (
      <SubvalueCell value={row.name} subvalue={row.description} />
    ),
    customFilterAndSearch: (
      query,
      row: any,
    ) =>
      `${row.name} ${row.description}`
      .toLocaleUpperCase('en-US')
      .includes(query.toLocaleUpperCase('en-US')),
  },
  {
    title: 'Namespace',
    field: 'namespace',
  },
];

type Props = {
  loading: boolean;
  retry: () => void;
  resources: Resource<ICluster>[];
};

const ClustersTableView = ({
  loading,
  retry,
  resources,
}: Props) => {
  const data = resources.map(({installationName, ...resource}) => (
    {
      installationName,
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      description: resource.metadata.annotations?.['cluster.giantswarm.io/description']
    }
  ));

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
        <Typography variant="h6">Clusters</Typography>
      }
      columns={generatedColumns}
    />
  );
};

type ClustersTableProps = {
  installations: string[];
}

export const ClustersTable = ({ installations }: ClustersTableProps) => {
  const { installationsData, initialLoading, retry } = useClusters();

  const resources: Resource<ICluster>[] = installationsData.flatMap(
    ({ installationName, data }) => data.map((cluster) => ({ installationName, ...cluster }))
  );

  return installations.length === 0 ? (
    <EmptyState
      missing="data"
      title="No Installations Selected"
      description="Please select one or more installations."
    />
  ) : (
    <Grid container spacing={3} direction="column">
      {/* {rejectedResults.length > 0 && (
        <Grid item>
          <RejectedResults results={rejectedResults} />
        </Grid>
      )} */}
      <Grid item>
        <ClustersTableView
          loading={initialLoading}
          resources={resources}
          retry={retry}
        />
      </Grid>
    </Grid>
  );
};
