import React, { useCallback, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Box, Typography } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import { getInitialColumns } from './columns';
import { ClusterData, useClustersData } from '../ClustersDataProvider';
import { useInstallationsStatuses } from '../../hooks';
import { InstallationsErrors } from '../../InstallationsErrors';

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
    visibleColumns,
    setVisibleColumns,
    queryParameters,
  } = useClustersData();

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

      if (
        JSON.stringify(newVisibleColumns.sort()) !==
        JSON.stringify(visibleColumns.sort())
      ) {
        setVisibleColumns(newVisibleColumns);
      }
    },
    10,
    [columns, visibleColumns, setVisibleColumns],
  );

  const { installationsStatuses } = useInstallationsStatuses();
  const installationsErrors = installationsStatuses.some(
    installationStatus => installationStatus.isError,
  );

  return (
    <>
      {installationsErrors && (
        <Box mb={2}>
          <InstallationsErrors installationsStatuses={installationsStatuses} />
        </Box>
      )}
      <ClustersTableView
        columns={columns}
        loading={isLoading}
        retry={retry}
        clustersData={clustersData}
        onChangeColumnHidden={handleChangeColumnHidden}
      />
    </>
  );
};
