import { useCallback, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { RouteRef } from '@backstage/core-plugin-api';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import { DeploymentData, useDeploymentsData } from '../DeploymentsDataProvider';
import { getInitialColumns } from './columns';
import {
  useTableColumns,
  DEPLOYMENTS_TABLE_ID,
  ENTITY_DEPLOYMENTS_TABLE_ID,
} from '../../hooks/useTableColumns';
import useDebounce from 'react-use/esm/useDebounce';

type Props = {
  columns: TableColumn<DeploymentData>[];
  loading: boolean;
  retry: () => void;
  deploymentsData: DeploymentData[];
  onChangeColumnHidden: (field: string, hidden: boolean) => void;
};

const DeploymentsTableView = ({
  columns,
  loading,
  retry,
  deploymentsData,
  onChangeColumnHidden,
}: Props) => {
  return (
    <Table<DeploymentData>
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
          tooltip: 'Reload deployments',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={deploymentsData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">
          Deployments ({deploymentsData.length})
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

type DeploymentsTableProps = {
  baseRouteRef: RouteRef;
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
  context?: 'catalog-entity' | 'deployments-page';
};

export const DeploymentsTable = ({
  baseRouteRef,
  sourceLocation,
  grafanaDashboard,
  ingressHost,
  context = 'deployments-page',
}: DeploymentsTableProps) => {
  const {
    filteredData: deploymentsData,
    isLoading,
    retry,
  } = useDeploymentsData();

  const { visibleColumns, saveVisibleColumns } = useTableColumns(
    context === 'deployments-page'
      ? DEPLOYMENTS_TABLE_ID
      : ENTITY_DEPLOYMENTS_TABLE_ID,
  );

  const [columns, setColumns] = useState(
    getInitialColumns({
      visibleColumns,
      baseRouteRef,
      grafanaDashboard,
      ingressHost,
      sourceLocation,
      context,
    }),
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
    [columns, saveVisibleColumns],
  );

  return (
    <DeploymentsTableView
      columns={columns}
      loading={isLoading}
      deploymentsData={deploymentsData}
      retry={retry}
      onChangeColumnHidden={handleChangeColumnHidden}
    />
  );
};
