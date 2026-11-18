import { useCallback, useMemo } from 'react';
import { makeStyles, useTheme } from '@material-ui/core';
import {
  Cell,
  Column,
  type ColumnConfig,
  Flex,
  Table,
  Text,
} from '@backstage/ui';
import {
  categoricalColors,
  formatLocalDateFull,
  getRelativeDate,
  InfoHint,
  StackedRowList,
  StatusDot,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import type { NodePoolNode } from '../../hooks';
import { zoneLetter } from '../PlatformClusterNodePools/nodePools';

const GIB = 1024 ** 3;

/** Cores as the node table says them: "2.3", "450m". */
export function formatCores(cores: number): string {
  return cores < 1 ? `${Math.round(cores * 1000)}m` : cores.toFixed(1);
}

/** Bytes as the node table says them: "9.1 GiB", "512 MiB". */
export function formatGiB(bytes: number): string {
  return bytes >= GIB
    ? `${(bytes / GIB).toFixed(1)} GiB`
    : `${Math.round(bytes / 1024 ** 2)} MiB`;
}

/** "3.92": allocatable CPU to two places, as the hover text gives it. */
function formatAllocatableCores(cores: number): string {
  return String(Number(cores.toFixed(2)));
}

function percent(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

/** `ip-10-0-41-12.eu-central-1.compute.internal` → `ip-10-0-41-12`. */
export function shortNodeName(name: string): string {
  return name.split('.')[0];
}

const COLUMN_HINTS = {
  cpu: 'Total CPU resource requests of all pods scheduled on this node, relative to allocatable CPU capacity.',
  memory:
    'Total memory resource requests of all pods scheduled on this node, relative to allocatable memory capacity.',
  pods: 'Number of pods currently running on this node, relative to the maximum number of pods the node can accommodate.',
};

/** A measure of a node: what its bar and value say, and the hover text. */
type Measure = { value: string; ratio: number; title: string };

export function cpuMeasure(node: NodePoolNode): Measure | undefined {
  if (node.cpuRequests === undefined || node.cpuAllocatable === undefined) {
    return undefined;
  }
  const share = percent(node.cpuRequests, node.cpuAllocatable);
  return {
    value: formatCores(node.cpuRequests),
    ratio: share / 100,
    title: `Requests: ${formatCores(node.cpuRequests)} of ${formatAllocatableCores(node.cpuAllocatable)} CPU allocatable (${share}%)`,
  };
}

export function memoryMeasure(node: NodePoolNode): Measure | undefined {
  if (
    node.memoryRequests === undefined ||
    node.memoryAllocatable === undefined
  ) {
    return undefined;
  }
  const share = percent(node.memoryRequests, node.memoryAllocatable);
  return {
    value: formatGiB(node.memoryRequests),
    ratio: share / 100,
    title: `Requests: ${formatGiB(node.memoryRequests)} of ${formatGiB(node.memoryAllocatable)} allocatable (${share}%)`,
  };
}

export function podsMeasure(node: NodePoolNode): Measure | undefined {
  if (node.runningPods === undefined || node.podsAllocatable === undefined) {
    return undefined;
  }
  const share = percent(node.runningPods, node.podsAllocatable);
  return {
    value: String(node.runningPods),
    ratio: share / 100,
    title: `Running: ${node.runningPods} of ${node.podsAllocatable} allocatable (${share}%)`,
  };
}

/** For assistive technology: the hover text, which a screen reader skips. */
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/**
 * Each column's least width, in px: the larger of its header (with the info
 * hint) and its usual value on one line, a bar with "27.3 GiB", "about 1
 * month ago". They add up to 966px, so the table shows every column in the
 * 984px a 1440px window gives it, as the design does.
 */
const MIN_WIDTHS: Record<string, number> = {
  node: 140,
  ready: 72,
  machine: 140,
  zone: 64,
  cpu: 135,
  memory: 160,
  pods: 110,
  created: 145,
};

const useStyles = makeStyles({
  meter: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    width: '100%',
    minWidth: 0,
  },
  track: {
    flex: '1 1 auto',
    minWidth: 32,
    height: 6,
    borderRadius: 3,
    background: 'var(--bui-bg-neutral-2)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  value: {
    flex: 'none',
    minWidth: 48,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  header: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
    whiteSpace: 'nowrap',
  },
});

/** A bar with its value beside it; the hover text gives the whole figure. */
function Meter({ measure, color }: { measure: Measure; color: string }) {
  const classes = useStyles();
  return (
    <div className={classes.meter} title={measure.title}>
      <div className={classes.track} aria-hidden>
        <div
          className={classes.fill}
          style={{
            width: `${Math.min(measure.ratio, 1) * 100}%`,
            background: color,
          }}
        />
      </div>
      <Text variant="body-medium" className={classes.value}>
        {measure.value}
        <span style={visuallyHidden}>{` (${measure.title})`}</span>
      </Text>
    </div>
  );
}

function MeasureCell({
  measure,
  color,
}: {
  measure: Measure | undefined;
  color: string;
}) {
  return (
    <Cell>
      {measure ? (
        <Meter measure={measure} color={color} />
      ) : (
        <Text variant="body-medium" color="secondary">
          —
        </Text>
      )}
    </Cell>
  );
}

/**
 * A column header with an info hint after its label, as bui's Table takes
 * a custom header: a `Column` of the column's id, its sizes from the
 * minimums `useFittingColumns` sets on the columns.
 */
function HeaderWithHint({
  id,
  label,
  hint,
}: {
  id: string;
  label: string;
  hint: string;
}) {
  const classes = useStyles();
  return (
    <Column id={id} minWidth={MIN_WIDTHS[id]} defaultWidth="1fr">
      <span className={classes.header}>
        {label}
        <InfoHint label={`About ${label.toLowerCase()}`}>{hint}</InfoHint>
      </span>
    </Column>
  );
}

function ReadyStatus({ node }: { node: NodePoolNode }) {
  if (node.ready) {
    return <StatusDot tone="success" label="Yes" />;
  }
  // The conditions as hover text, so a row keeps its height.
  const title = node.conditions.length
    ? `Not ready: ${node.conditions.join(', ')}`
    : 'Not ready';
  return (
    <span title={title}>
      <StatusDot tone="danger" label="No" />
    </span>
  );
}

/** One short unit on one line: a zone, a date. */
const NO_WRAP = { whiteSpace: 'nowrap' } as const;

/** Left out first, named under the node's name. */
const DROP_FIRST = ['machine', 'zone', 'created'] as const;

export type PlatformNodesTableProps = {
  nodes: NodePoolNode[];
  isLoading: boolean;
};

/**
 * The nodes of a node pool, from Mimir (`useMimirNodePoolNodes`): ready,
 * machine, zone, the CPU and memory its pods request and the pods it runs,
 * each as a bar with its value, and its age.
 */
export function PlatformNodesTable({
  nodes,
  isLoading,
}: PlatformNodesTableProps) {
  const theme = useTheme();
  const palette = categoricalColors(theme);
  // The shell's categorical palette: blue for CPU, violet for memory, aqua
  // for pods, one hue per measure as the design gives each its own.
  const colors = useMemo(
    () => ({ cpu: palette[0], memory: palette[6], pods: palette[2] }),
    [palette],
  );
  const now = useMemo(() => new Date(), []);
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => a.node.localeCompare(b.node)),
    [nodes],
  );

  const columnsFor = useCallback(
    (isNarrow: boolean): ColumnConfig<NodePoolNode>[] => [
      {
        id: 'node',
        label: 'Node',
        isRowHeader: true,
        defaultWidth: '1.2fr',
        cell: node => (
          <Cell>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Text
                variant="body-small"
                title={node.node}
                style={{ fontFamily: '"Roboto Mono", monospace' }}
              >
                {shortNodeName(node.node)}
              </Text>
              {isNarrow && (
                <Text variant="body-small" color="secondary">
                  {[
                    node.instanceType,
                    node.zone ? `zone ${zoneLetter(node.zone)}` : undefined,
                    node.created
                      ? `created ${getRelativeDate(node.created.toISOString(), now)}`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            </div>
          </Cell>
        ),
      },
      {
        id: 'ready',
        label: 'Ready',
        defaultWidth: '0.5fr',
        cell: node => (
          <Cell>
            <ReadyStatus node={node} />
          </Cell>
        ),
      },
      {
        id: 'machine',
        label: 'Machine',
        defaultWidth: '0.8fr',
        cell: node => (
          <Cell>
            <Text variant="body-medium" style={NO_WRAP}>
              {node.instanceType ?? '—'}
            </Text>
          </Cell>
        ),
      },
      {
        id: 'zone',
        label: 'Zone',
        defaultWidth: '0.4fr',
        cell: node => (
          <Cell>
            <Text variant="body-medium" title={node.zone} style={NO_WRAP}>
              {node.zone ? zoneLetter(node.zone) : '—'}
            </Text>
          </Cell>
        ),
      },
      {
        id: 'cpu',
        label: 'CPU requests',
        header: () => (
          <HeaderWithHint
            id="cpu"
            label="CPU requests"
            hint={COLUMN_HINTS.cpu}
          />
        ),
        defaultWidth: '1fr',
        cell: node => (
          <MeasureCell measure={cpuMeasure(node)} color={colors.cpu} />
        ),
      },
      {
        id: 'memory',
        label: 'Memory requests',
        header: () => (
          <HeaderWithHint
            id="memory"
            label="Memory requests"
            hint={COLUMN_HINTS.memory}
          />
        ),
        defaultWidth: '1fr',
        cell: node => (
          <MeasureCell measure={memoryMeasure(node)} color={colors.memory} />
        ),
      },
      {
        id: 'pods',
        label: 'Pods',
        header: () => (
          <HeaderWithHint id="pods" label="Pods" hint={COLUMN_HINTS.pods} />
        ),
        defaultWidth: '1fr',
        cell: node => (
          <MeasureCell measure={podsMeasure(node)} color={colors.pods} />
        ),
      },
      {
        id: 'created',
        label: 'Created',
        defaultWidth: '0.9fr',
        cell: node => (
          <Cell>
            <Text
              variant="body-medium"
              color="secondary"
              title={
                node.created ? formatLocalDateFull(node.created) : undefined
              }
              style={NO_WRAP}
            >
              {node.created
                ? getRelativeDate(node.created.toISOString(), now)
                : '—'}
            </Text>
          </Cell>
        ),
      },
    ],
    [colors, now],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });

  return (
    <div ref={fit.ref}>
      {fit.isCompact && !isLoading ? (
        <StackedRowList
          aria-label="Nodes"
          rows={sorted.map(node => {
            const cpu = cpuMeasure(node);
            const memory = memoryMeasure(node);
            const pods = podsMeasure(node);
            return {
              id: node.id,
              title: shortNodeName(node.node),
              status: <ReadyStatus node={node} />,
              facts: [
                node.instanceType,
                node.zone ? `zone ${zoneLetter(node.zone)}` : undefined,
              ],
              details: (
                <Flex direction="column" gap="1">
                  {cpu && <Text variant="body-small">CPU {cpu.title}</Text>}
                  {memory && (
                    <Text variant="body-small">Memory {memory.title}</Text>
                  )}
                  {pods && <Text variant="body-small">Pods {pods.title}</Text>}
                  {!node.ready && node.conditions.length > 0 && (
                    <Text variant="body-small" color="secondary">
                      Not ready: {node.conditions.join(', ')}
                    </Text>
                  )}
                </Flex>
              ),
            };
          })}
        />
      ) : (
        <Table<NodePoolNode>
          columnConfig={fit.columns}
          data={isLoading ? undefined : sorted}
          pagination={{ type: 'none' }}
        />
      )}
    </div>
  );
}
