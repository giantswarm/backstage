import { useCallback, useMemo, useState } from 'react';
import { Table } from '@backstage/core-components';
import { MTableToolbar } from '@material-table/core';
import { Box, Typography } from '@material-ui/core';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import useDebounce from 'react-use/esm/useDebounce';
import {
  useMusterInstance,
  useMusterSession,
} from '../../MusterInstanceProvider';
import { CreateWorkflowButton } from '../WorkflowMutationActions';
import { useWorkflowsData } from '../WorkflowsDataProvider';
import { getInitialColumns } from './columns';

export const WORKFLOWS_TABLE_ID = 'muster-workflows';

export const WorkflowsTable = () => {
  const { filteredData, isLoading } = useWorkflowsData();
  const { activeInstallation } = useMusterInstance();
  const { authenticated } = useMusterSession();

  const { visibleColumns, saveVisibleColumns } =
    useTableColumns(WORKFLOWS_TABLE_ID);

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

  // Render the standard toolbar (title, search, column-selection button) plus
  // the "Create workflow" button beside it. Memoized so the 30s data refetch
  // (which re-renders this component with a new `data` array) does not remount
  // the toolbar -- which would drop focus from the search box and close the
  // Create dialog.
  const ToolbarComponent = useMemo(
    () => (toolbarProps: React.ComponentProps<typeof MTableToolbar>) => (
      <Box display="flex" alignItems="center">
        <Box flexGrow={1}>
          <MTableToolbar {...toolbarProps} />
        </Box>
        <Box flexShrink={0} mr={2}>
          <CreateWorkflowButton
            installation={activeInstallation}
            authenticated={authenticated}
          />
        </Box>
      </Box>
    ),
    [activeInstallation, authenticated],
  );

  return (
    <Table
      isLoading={isLoading}
      options={{
        pageSize: 25,
        pageSizeOptions: [10, 25, 50, 100],
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      components={{
        Toolbar: ToolbarComponent,
      }}
      data={filteredData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">Workflows ({filteredData.length})</Typography>
      }
      columns={columns}
      onChangeColumnHidden={(column, hidden) => {
        if (column.field) {
          handleChangeColumnHidden(column.field, hidden);
        }
      }}
    />
  );
};
