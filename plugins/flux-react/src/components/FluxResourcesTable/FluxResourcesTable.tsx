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
        pageSizeOptions: [50, 100],
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

const FLUX_RESOURCES_TABLE_ID = 'flux-resources-table';

// Simple column visibility management (in real implementation, this would use proper storage)
const useTableColumns = (tableId: string) => {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const saveVisibleColumns = useCallback((columns: string[]) => {
    setVisibleColumns(columns);
    // In real implementation, save to localStorage or similar
  }, []);

  return { visibleColumns, saveVisibleColumns };
};

export const FluxResourcesTable = () => {
  const {
    filteredData: fluxResourcesData,
    isLoading,
    retry,
  } = useFluxResourcesData();

  const { visibleColumns, saveVisibleColumns } = useTableColumns(
    FLUX_RESOURCES_TABLE_ID,
  );

  const [columns, setColumns] = useState(getInitialColumns({ visibleColumns }));

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
    [columns, saveVisibleColumns],
  );

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
