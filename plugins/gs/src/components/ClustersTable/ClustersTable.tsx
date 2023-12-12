import React from 'react';
import { SubvalueCell, Table, TableColumn } from '@backstage/core-components';
import { useClusters } from '../useClusters';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
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

export const ClustersTable = () => {
  const { installationsData, initialLoading, retry } = useClusters();

  const resources: Resource<ICluster>[] = installationsData.flatMap(
    ({ installationName, data }) => data.map((cluster) => ({ installationName, ...cluster }))
  );

  return (
    <ClustersTableView
      loading={initialLoading}
      resources={resources}
      retry={retry}
    />
  );
};
