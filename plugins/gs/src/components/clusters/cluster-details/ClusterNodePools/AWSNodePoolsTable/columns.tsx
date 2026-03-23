import { TableColumn } from '@backstage/core-components';
import { Link, Tooltip } from '@material-ui/core';
import { getInstanceTypeTooltip } from '../awsInstanceTypeInfo';
import {
  isTableColumnHidden,
  sortAndFilterOptions,
} from '@giantswarm/backstage-plugin-ui-react';
import { DateComponent, NotAvailable } from '../../../../UI';

export type AWSNodePoolRow = {
  id: string;
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
  onSelectNodePool,
}: {
  visibleColumns: string[];
  onSelectNodePool: (name: string) => void;
}): TableColumn<AWSNodePoolRow>[] {
  const columns: TableColumn<AWSNodePoolRow>[] = [
    {
      title: 'Name',
      field: AWSNodePoolColumns.name,
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
      render: row => {
        if (!row.instanceType) return <NotAvailable />;
        const tip = getInstanceTypeTooltip(row.instanceType);
        if (!tip) return row.instanceType;
        return (
          <Tooltip title={tip} arrow>
            <span>{row.instanceType}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Availability zones',
      field: AWSNodePoolColumns.availabilityZones,
      render: row =>
        row.availabilityZones ? (
          <Tooltip title={row.availabilityZones.join(', ')} arrow>
            <span>
              {row.availabilityZones
                .map(az => az.slice(-1).toUpperCase())
                .join(', ')}
            </span>
          </Tooltip>
        ) : (
          <NotAvailable />
        ),
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
