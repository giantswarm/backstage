import { useCallback, useEffect, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import { getInitialColumns } from './columns';
import {
  FluxResourceData,
  useFluxResourcesData,
} from '../FluxResourcesDataProvider';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';

export const FLUX_RESOURCES_TABLE_ID = 'flux-resources';

type Props = {
  columns: TableColumn<FluxResourceData>[];
  loading: boolean;
  retry: () => void;
  fluxResourcesData: FluxResourceData[];
  onChangeColumnHidden: (field: string, hidden: boolean) => void;
};

const FluxResourcesTableView = ({
  columns,
  loading,
  fluxResourcesData,
  retry,
  onChangeColumnHidden,
}: Props) => {
  return (
    <Table<FluxResourceData>
      isLoading={loading}
      options={{
        pageSize: 50,
        pageSizeOptions: [10, 25, 50, 100],
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload Flux resources',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={fluxResourcesData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">
          Flux Resources ({fluxResourcesData.length})
        </Typography>
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

export const FluxResourcesTable = ({
  onSelectResource,
}: {
  onSelectResource: (
    cluster: string,
    kind: string,
    name: string,
    namespace?: string,
  ) => void;
}) => {
  const {
    filteredData: fluxResourcesData,
    isLoading,
    retry,
    setVisibleColumns,
  } = useFluxResourcesData();

  const { visibleColumns, saveVisibleColumns } = useTableColumns(
    FLUX_RESOURCES_TABLE_ID,
  );

  const [columns, setColumns] = useState(
    getInitialColumns({ visibleColumns, onClick: onSelectResource }),
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
    <FluxResourcesTableView
      columns={columns}
      loading={isLoading}
      fluxResourcesData={fluxResourcesData}
      retry={retry}
      onChangeColumnHidden={handleChangeColumnHidden}
    />
  );
};
