import React from 'react';
import { EmptyState, Table, TableColumn } from '@backstage/core-components';
import { useClusters } from '../useClusters';
import { ICluster } from '../../model/services/mapi/capiv1beta1';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';

const generatedColumns: TableColumn[] = [
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
  clusters?: ICluster[];
};

const ClustersTableView = ({
  loading,
  retry,
  clusters,
}: Props) => {
  const data = clusters ? clusters.map(cluster => {
    return {
      name: cluster.metadata.name,
      namespace: cluster.metadata.namespace,
      description: cluster.metadata.annotations?.['cluster.giantswarm.io/description']
    };
  }) : [];

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

export const ClustersTable = () => {
  const [{ clusters, ...tableProps }, { retry }] = useClusters({});

  const hasNoClusters = !tableProps.loading && !clusters;

  return hasNoClusters ? (
    <EmptyState
      missing="data"
      title="No Clusters Data"
      description="Couldn't find any clusters"
    />
  ) : (
    <ClustersTableView
      {...tableProps}
      clusters={clusters}
      retry={retry}
    />
  );
};
