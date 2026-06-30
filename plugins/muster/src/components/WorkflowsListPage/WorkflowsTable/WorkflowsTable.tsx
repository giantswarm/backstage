import { useCallback, useMemo, useState } from 'react';
import { Table } from '@backstage/core-components';
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

  // Render the "Create workflow" button as a toolbar free action, next to the
  // column-selection button. Memoized so the 30s data refetch (which re-renders
  // this component with a new `data` array) does not remount the button and
  // close its open dialog.
  const ActionComponent = useMemo(
    () => () => (
      <Box display="flex" alignItems="center" mr={2} style={{ marginTop: 10 }}>
        <CreateWorkflowButton
          installation={activeInstallation}
          authenticated={authenticated}
        />
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
      actions={[
        {
          // The icon is unused — `components.Action` renders the button instead.
          icon: () => <></>,
          isFreeAction: true,
          onClick: () => {},
        },
      ]}
      components={{
        Action: ActionComponent,
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
