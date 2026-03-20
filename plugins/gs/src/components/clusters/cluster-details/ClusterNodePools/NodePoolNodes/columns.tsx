import { TableColumn } from '@backstage/core-components';
import {
  Box,
  LinearProgress,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import { sortAndFilterOptions } from '@giantswarm/backstage-plugin-ui-react';
import { NodePoolNode } from '../../../../hooks';
import { DateComponent, NotAvailable } from '../../../../UI';

function shortenNodeName(name: string): string {
  return name.split('.')[0];
}

function shortenAZ(zone: string): string {
  const suffix = zone.slice(-1);
  return suffix.toUpperCase();
}

function formatMemory(bytes: number): string {
  const gi = bytes / (1024 * 1024 * 1024);
  if (gi >= 1) return `${gi.toFixed(1)} Gi`;
  const mi = bytes / (1024 * 1024);
  return `${mi.toFixed(0)} Mi`;
}

function formatCpu(cores: number): string {
  if (cores < 1) return `${Math.round(cores * 1000)}m`;
  return cores.toFixed(1);
}

function ColumnHeader({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Box display="flex" alignItems="center" style={{ gap: 4 }}>
      {label}
      <Tooltip title={tooltip} arrow>
        <InfoOutlinedIcon
          style={{ fontSize: 16, opacity: 0.5, cursor: 'help' }}
        />
      </Tooltip>
    </Box>
  );
}

const useRatioBarStyles = makeStyles(() => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 120,
  },
  bar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  cpuBarColor: {
    backgroundColor: '#5c99ed',
  },
  memoryBarColor: {
    backgroundColor: '#b57cd6',
  },
  label: {
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
  },
}));

type BarVariant = 'cpu' | 'memory' | 'default';

function RatioBar({
  used,
  total,
  label,
  tooltip,
  variant = 'default',
}: {
  used: number;
  total: number;
  label: string;
  tooltip: string;
  variant?: BarVariant;
}) {
  const classes = useRatioBarStyles();
  const percent = total > 0 ? (used / total) * 100 : 0;

  const barColorClass =
    variant === 'cpu'
      ? classes.cpuBarColor
      : variant === 'memory'
        ? classes.memoryBarColor
        : undefined;

  return (
    <Tooltip title={tooltip} arrow>
      <Box className={classes.root}>
        <LinearProgress
          variant="determinate"
          value={Math.min(percent, 100)}
          className={classes.bar}
          classes={
            barColorClass
              ? { bar: barColorClass, bar1Determinate: barColorClass }
              : undefined
          }
        />
        <Typography variant="body2" className={classes.label}>
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export function getColumns(): TableColumn<NodePoolNode>[] {
  return [
    {
      title: 'Node',
      field: 'node',
      highlight: true,
      cellStyle: { whiteSpace: 'nowrap' },
      ...sortAndFilterOptions(row => row.node),
      render: row => shortenNodeName(row.node),
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
      width: '1%',
      ...sortAndFilterOptions(row => row.zone),
      render: row => (row.zone ? shortenAZ(row.zone) : <NotAvailable />),
    },
    {
      title: 'Ready',
      field: 'ready',
      width: '1%',
      render: row => (row.ready ? 'Yes' : 'No'),
    },
    {
      title: 'Conditions',
      field: 'conditions',
      render: row =>
        row.conditions.length > 0 ? (
          <Typography
            variant="body2"
            style={{ color: '#d32f2f', whiteSpace: 'nowrap' }}
          >
            {row.conditions.join(', ')}
          </Typography>
        ) : (
          '\u2014'
        ),
      customSort: (a, b) => a.conditions.length - b.conditions.length,
    },
    {
      title: (
        <ColumnHeader
          label="CPU Requests"
          tooltip="Total CPU resource requests of all pods scheduled on this node, relative to allocatable CPU capacity."
        />
      ),
      field: 'cpuRequests',
      render: row => {
        if (row.cpuRequests === undefined || row.cpuAllocatable === undefined) {
          return <NotAvailable />;
        }
        return (
          <RatioBar
            used={row.cpuRequests}
            total={row.cpuAllocatable}
            label={formatCpu(row.cpuRequests)}
            tooltip={`Requests: ${formatCpu(row.cpuRequests)} of ${formatCpu(row.cpuAllocatable)} allocatable (${((row.cpuRequests / row.cpuAllocatable) * 100).toFixed(0)}%)`}
            variant="cpu"
          />
        );
      },
      customSort: (a, b) => (a.cpuRequests ?? 0) - (b.cpuRequests ?? 0),
    },
    {
      title: (
        <ColumnHeader
          label="Memory Requests"
          tooltip="Total memory resource requests of all pods scheduled on this node, relative to allocatable memory capacity."
        />
      ),
      field: 'memoryRequests',
      render: row => {
        if (
          row.memoryRequests === undefined ||
          row.memoryAllocatable === undefined
        ) {
          return <NotAvailable />;
        }
        return (
          <RatioBar
            used={row.memoryRequests}
            total={row.memoryAllocatable}
            label={formatMemory(row.memoryRequests)}
            tooltip={`Requests: ${formatMemory(row.memoryRequests)} of ${formatMemory(row.memoryAllocatable)} allocatable (${((row.memoryRequests / row.memoryAllocatable) * 100).toFixed(0)}%)`}
            variant="memory"
          />
        );
      },
      customSort: (a, b) => (a.memoryRequests ?? 0) - (b.memoryRequests ?? 0),
    },
    {
      title: (
        <ColumnHeader
          label="Pods"
          tooltip="Number of pods currently running on this node, relative to the maximum number of pods the node can accommodate."
        />
      ),
      field: 'runningPods',
      render: row => {
        if (
          row.runningPods === undefined ||
          row.podsAllocatable === undefined
        ) {
          return <NotAvailable />;
        }
        return (
          <RatioBar
            used={row.runningPods}
            total={row.podsAllocatable}
            label={String(row.runningPods)}
            tooltip={`Running: ${row.runningPods} of ${row.podsAllocatable} allocatable (${((row.runningPods / row.podsAllocatable) * 100).toFixed(0)}%)`}
          />
        );
      },
      customSort: (a, b) => (a.runningPods ?? 0) - (b.runningPods ?? 0),
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
