import { TableColumn } from '@backstage/core-components';
import { sortAndFilterOptions } from '@giantswarm/backstage-plugin-ui-react';
import { NodePoolNode } from '../../../../hooks/useMimirNodePoolNodes';
import { DateComponent, NotAvailable } from '../../../../UI';

function formatMemory(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  const gi = bytes / (1024 * 1024 * 1024);
  return `${gi.toFixed(1)} Gi`;
}

function formatCpu(cores: number | undefined): string {
  if (cores === undefined) return '';
  return `${cores}`;
}

export function getColumns(): TableColumn<NodePoolNode>[] {
  return [
    {
      title: 'Node',
      field: 'node',
      highlight: true,
      cellStyle: { whiteSpace: 'nowrap' },
      ...sortAndFilterOptions(row => row.node),
    },
    {
      title: 'Instance type',
      field: 'instanceType',
      ...sortAndFilterOptions(row => row.instanceType),
      render: row => row.instanceType ?? <NotAvailable />,
    },
    {
      title: 'AZ',
      field: 'zone',
      ...sortAndFilterOptions(row => row.zone),
      render: row => row.zone ?? <NotAvailable />,
    },
    {
      title: 'Ready',
      field: 'ready',
      render: row => (row.ready ? 'Yes' : 'No'),
    },
    {
      title: 'CPU',
      field: 'cpuAllocatable',
      type: 'numeric',
      render: row =>
        row.cpuAllocatable !== undefined ? (
          formatCpu(row.cpuAllocatable)
        ) : (
          <NotAvailable />
        ),
    },
    {
      title: 'Memory',
      field: 'memoryAllocatable',
      type: 'numeric',
      render: row =>
        row.memoryAllocatable !== undefined ? (
          formatMemory(row.memoryAllocatable)
        ) : (
          <NotAvailable />
        ),
    },
    {
      title: 'Pods',
      field: 'runningPods',
      type: 'numeric',
      render: row => {
        if (
          row.runningPods === undefined &&
          row.podsAllocatable === undefined
        ) {
          return <NotAvailable />;
        }
        const running = row.runningPods ?? '?';
        const allocatable = row.podsAllocatable ?? '?';
        return `${running} / ${allocatable}`;
      },
    },
    {
      title: 'Created',
      field: 'created',
      type: 'datetime',
      render: row =>
        row.created ? (
          <DateComponent value={row.created} relative />
        ) : (
          <NotAvailable />
        ),
    },
  ];
}
