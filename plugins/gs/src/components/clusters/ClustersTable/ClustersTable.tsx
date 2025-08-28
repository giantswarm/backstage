import { useCallback, useEffect, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import { getInitialColumns } from './columns';
import { ClusterData, useClustersData } from '../ClustersDataProvider';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';

export const CLUSTERS_TABLE_ID = 'clusters';

type Props = {
  columns: TableColumn<ClusterData>[];
  loading: boolean;
  retry: () => void;
  clustersData: ClusterData[];
  onChangeColumnHidden: (field: string, hidden: boolean) => void;
};

const ClustersTableView = ({
  columns,
  loading,
  clustersData,
  retry,
  onChangeColumnHidden,
}: Props) => {
  return (
    <Table<ClusterData>
      isLoading={loading}
      options={{
        paging: false,
        columnsButton: true,
      }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload clusters',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={clustersData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">Clusters ({clustersData.length})</Typography>
      }
      columns={columns}
      onChangeColumnHidden={(column, hidden) => {
        if (column.field) {
          onChangeColumnHidden(column.field, hidden);
        }
      }}
    />
  );
};

export const ClustersTable = () => {
  const {
    filteredData: clustersData,
    isLoading,
    retry,
    setVisibleColumns,
    queryParameters,
  } = useClustersData();

  const { visibleColumns, saveVisibleColumns } =
    useTableColumns(CLUSTERS_TABLE_ID);

  const [columns, setColumns] = useState(
    getInitialColumns({ visibleColumns, queryParameters }),
  );

  const handleChangeColumnHidden = useCallback(
    (field: string, hidden: boolean) => {
      setColumns(prev =>
        prev.map(column => {
          if (column.field === field) {
            return {
              ...column,
              hidden,
            };
          }

          return column;
        }),
      );
    },
    [],
  );

  useDebounce(
    () => {
      const newVisibleColumns = columns
        .filter(column => !Boolean(column.hidden))
        .map(column => column.field) as string[];

      saveVisibleColumns(newVisibleColumns);
    },
    10,
    [columns, setVisibleColumns],
  );

  useEffect(() => {
    setVisibleColumns(visibleColumns);
  }, [setVisibleColumns, visibleColumns]);

  return (
    <ClustersTableView
      columns={columns}
      loading={isLoading}
      retry={retry}
      clustersData={clustersData}
      onChangeColumnHidden={handleChangeColumnHidden}
    />
  );
};
