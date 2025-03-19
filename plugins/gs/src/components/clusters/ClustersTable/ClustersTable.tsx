import React, { useCallback, useEffect, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Box, Typography } from '@material-ui/core';
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
  const [columns, setColumns] = useState(getInitialColumns());

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

  const {
    filteredData: clustersData,
    isLoading,
    retry,
    setVisibleColumns,
  } = useClustersData();

  useEffect(() => {
    const visibleColumns = columns
      .filter(column => !Boolean(column.hidden))
      .map(column => column.field) as string[];

    setVisibleColumns(visibleColumns);
  }, [columns, setVisibleColumns]);

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
