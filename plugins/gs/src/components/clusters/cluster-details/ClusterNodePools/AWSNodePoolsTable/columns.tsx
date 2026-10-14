import { TableColumn } from '@backstage/core-components';
import { Link, Tooltip } from '@material-ui/core';
import { formatLimits } from '../karpenter';
import {
  isTableColumnHidden,
  sortAndFilterOptions,
} from '@giantswarm/backstage-plugin-ui-react';
import { DateComponent, NotAvailable } from '../../../../UI';
import { AWSNodePoolRow } from '../../../nodePools';

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
        if (!row.machineTypeDescription) return row.instanceType;
        return (
          <Tooltip title={row.machineTypeDescription} arrow>
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
          // No limits and an unread CR both yield an empty list, but they are
          // different claims: only the former means the pool is unlimited.
          if (row.limits === undefined) {
            return <NotAvailable />;
          }
          const limits = formatLimits(row.limits);
          if (limits.length === 0) {
            return 'Unlimited';
          }
          const summary = limits
            .map(limit => `${limit.resource} ${limit.value}`)
            .join(' \u00b7 ');

          return (
            <Tooltip title={`Karpenter provisioning limits: ${summary}`} arrow>
              <span>{summary}</span>
            </Tooltip>
          );
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
