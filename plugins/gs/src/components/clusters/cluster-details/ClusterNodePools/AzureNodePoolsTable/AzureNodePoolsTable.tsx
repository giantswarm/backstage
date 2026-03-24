import { useCallback, useRef, useState } from 'react';
import { Table } from '@backstage/core-components';
import { Typography, useTheme } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { AzureNodePoolRow, getInitialColumns } from './columns';

const TABLE_ID = 'azure-node-pools';

interface AzureNodePoolsTableProps {
  data: AzureNodePoolRow[];
  isLoading: boolean;
  selectedNodePool?: string;
  onSelectNodePool: (name: string) => void;
}

export const AzureNodePoolsTable = ({
  data,
  isLoading,
  selectedNodePool,
  onSelectNodePool,
}: AzureNodePoolsTableProps) => {
  const theme = useTheme();
  const onSelectNodePoolRef = useRef(onSelectNodePool);
  onSelectNodePoolRef.current = onSelectNodePool;

  const { visibleColumns, saveVisibleColumns } = useTableColumns(TABLE_ID);

  const [columns, setColumns] = useState(() =>
    getInitialColumns({
      visibleColumns,
      onSelectNodePool: (name: string) => onSelectNodePoolRef.current(name),
    }),
  );

  const handleChangeColumnHidden = useCallback(
    (field: string, hidden: boolean) => {
      setColumns(prev =>
        prev.map(column => {
          if (column.field === field) {
            return { ...column, hidden };
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
    [columns],
  );

  return (
    <Table<AzureNodePoolRow>
      isLoading={isLoading}
      options={{
        paging: false,
        columnsButton: true,
        rowStyle: (rowData: AzureNodePoolRow) =>
          rowData.name === selectedNodePool
            ? { backgroundColor: theme.palette.action.selected }
            : {},
      }}
      data={data}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Node pools ({data.length})</Typography>}
      columns={columns}
      onChangeColumnHidden={(column, hidden) => {
        if (column.field) {
          handleChangeColumnHidden(column.field, hidden);
        }
      }}
    />
  );
};
