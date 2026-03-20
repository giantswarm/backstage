import { TableColumn } from '@backstage/core-components';
import { Link } from '@material-ui/core';
import {
  isTableColumnHidden,
  sortAndFilterOptions,
} from '@giantswarm/backstage-plugin-ui-react';
import { DateComponent, NotAvailable } from '../../../../UI';

export type AzureNodePoolRow = {
  id: string;
  name: string;
  desiredReplicas: number | undefined;
  readyReplicas: number | undefined;
  vmSize: string | undefined;
  phase: string | undefined;
  created: string | undefined;
};

const AzureNodePoolColumns = {
  name: 'name',
  nodesDesired: 'nodesDesired',
  nodesReady: 'nodesReady',
  vmSize: 'vmSize',
  phase: 'phase',
  created: 'created',
} as const;

export function getInitialColumns({
  visibleColumns,
  onSelectNodePool,
}: {
  visibleColumns: string[];
  onSelectNodePool: (name: string) => void;
}): TableColumn<AzureNodePoolRow>[] {
  const columns: TableColumn<AzureNodePoolRow>[] = [
    {
      title: 'Name',
      field: AzureNodePoolColumns.name,
      highlight: true,
      defaultSort: 'asc',
      cellStyle: { whiteSpace: 'nowrap' },
      ...sortAndFilterOptions(row => row.name),
      render: row => (
        <Link
          component="button"
          variant="body2"
          style={{ fontWeight: 700 }}
          onClick={() => onSelectNodePool(row.name)}
        >
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Nodes desired',
      field: AzureNodePoolColumns.nodesDesired,
      type: 'numeric',
      render: row =>
        row.desiredReplicas !== undefined ? (
          row.desiredReplicas
        ) : (
          <NotAvailable />
        ),
    },
    {
      title: 'Nodes ready',
      field: AzureNodePoolColumns.nodesReady,
      type: 'numeric',
      render: row =>
        row.readyReplicas !== undefined ? row.readyReplicas : <NotAvailable />,
    },
    {
      title: 'VM size',
      field: AzureNodePoolColumns.vmSize,
      render: row => row.vmSize ?? <NotAvailable />,
    },
    {
      title: 'Phase',
      field: AzureNodePoolColumns.phase,
      render: row => row.phase ?? <NotAvailable />,
    },
    {
      title: 'Created',
      field: AzureNodePoolColumns.created,
      type: 'datetime',
      render: row => <DateComponent value={row.created} relative />,
    },
  ];

  return columns.map(column => ({
    ...column,
    hidden: isTableColumnHidden(column.field, {
      defaultValue: Boolean(column.hidden),
      visibleColumns,
    }),
  }));
}
