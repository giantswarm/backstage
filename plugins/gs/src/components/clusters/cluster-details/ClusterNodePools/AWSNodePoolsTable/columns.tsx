import { TableColumn } from '@backstage/core-components';
import {
  isTableColumnHidden,
  sortAndFilterOptions,
} from '@giantswarm/backstage-plugin-ui-react';
import { DateComponent, NotAvailable } from '../../../../UI';

export type AWSNodePoolRow = {
  name: string;
  type: 'ASG' | 'Karpenter';
  desiredReplicas: number | undefined;
  readyReplicas: number | undefined;
  instanceType: string | undefined;
  availabilityZones: string[] | undefined;
  minSize: number | undefined;
  maxSize: number | undefined;
  phase: string | undefined;
  created: string | undefined;
};

const AWSNodePoolColumns = {
  name: 'name',
  type: 'type',
  nodesDesired: 'nodesDesired',
  nodesReady: 'nodesReady',
  instanceType: 'instanceType',
  availabilityZones: 'availabilityZones',
  scaling: 'scaling',
  phase: 'phase',
  created: 'created',
} as const;

export function getInitialColumns({
  visibleColumns,
}: {
  visibleColumns: string[];
}): TableColumn<AWSNodePoolRow>[] {
  const columns: TableColumn<AWSNodePoolRow>[] = [
    {
      title: 'Name',
      field: AWSNodePoolColumns.name,
      highlight: true,
      defaultSort: 'asc',
      cellStyle: { whiteSpace: 'nowrap' },
      ...sortAndFilterOptions(row => row.name),
    },
    {
      title: 'Type',
      field: AWSNodePoolColumns.type,
    },
    {
      title: 'Nodes desired',
      field: AWSNodePoolColumns.nodesDesired,
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
      field: AWSNodePoolColumns.nodesReady,
      type: 'numeric',
      render: row =>
        row.readyReplicas !== undefined ? row.readyReplicas : <NotAvailable />,
    },
    {
      title: 'Instance type',
      field: AWSNodePoolColumns.instanceType,
      render: row => row.instanceType ?? <NotAvailable />,
    },
    {
      title: 'Availability zones',
      field: AWSNodePoolColumns.availabilityZones,
      render: row => row.availabilityZones?.join(', ') ?? <NotAvailable />,
    },
    {
      title: 'Scaling',
      field: AWSNodePoolColumns.scaling,
      render: row => {
        if (row.type === 'Karpenter') {
          return 'Karpenter-managed';
        }
        if (row.minSize !== undefined && row.maxSize !== undefined) {
          return `${row.minSize} \u2013 ${row.maxSize}`;
        }
        return <NotAvailable />;
      },
    },
    {
      title: 'Phase',
      field: AWSNodePoolColumns.phase,
      render: row => row.phase ?? <NotAvailable />,
    },
    {
      title: 'Created',
      field: AWSNodePoolColumns.created,
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
