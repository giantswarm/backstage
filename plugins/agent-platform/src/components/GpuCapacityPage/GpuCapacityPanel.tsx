import { useMemo } from 'react';
import {
  Alert,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { formatBytes, formatTime } from '../../lib/modelManagerServing';
import {
  gpuFree,
  gpuTotal,
  type GpuCapacityUnavailableReason,
  type GpuNode,
} from '../../lib/serving';

/** MiB → a short GiB figure, e.g. 122880 → "120 GiB". */
export function formatGpuMemory(memoryMiB: number | undefined): string {
  if (memoryMiB === undefined) {
    return '—';
  }
  const gib = memoryMiB / 1024;
  return `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB`;
}

/**
 * A figure the cluster does not have, said as such. "Unknown" (with the reason
 * on hover) rather than "0" or a blank: a node without a device plugin still
 * has GPUs, we just cannot count what is free on it.
 */
function UnknownCell({ reason }: { reason: string }) {
  return (
    <Cell>
      <Text as="p" variant="body-medium" color="secondary" title={reason}>
        unknown
      </Text>
    </Cell>
  );
}

const NO_DEVICE_PLUGIN =
  'The node advertises no nvidia.com/gpu resource — no device plugin is running, so only the discovery labels are known.';
const NO_POD_DATA =
  'The pods on this node could not be read, so scheduled GPU requests are unknown.';

/** The optional columns, shown when any node reports the data. */
export type GpuCapacityColumns = {
  /** The memory budget a serving backend fit-checks against (model-manager). */
  budget: boolean;
  /** The download cache on the node (model-manager). */
  cache: boolean;
};

export function columnsForNodes(nodes: GpuNode[]): GpuCapacityColumns {
  return {
    budget: nodes.some(node => node.memoryBudgetBytes !== undefined),
    cache: nodes.some(node => node.cache !== undefined),
  };
}

/** "86.1 GiB free of 86.1 GiB", with the source and the reservation on hover. */
function BudgetCell({ node }: { node: GpuNode }) {
  if (node.memoryBudgetBytes === undefined) {
    return <CellText title="—" />;
  }
  const free = node.memoryFreeBytes ?? node.memoryBudgetBytes;
  let source: string | undefined;
  if (node.memoryBudgetSource === 'gpu-labels') {
    source = 'Budget: the GPU memory from the node labels';
  } else if (node.memoryBudgetSource === 'allocatable') {
    source =
      'Budget: the allocatable node memory (no GPU memory label — a unified-memory or CPU node)';
  }
  const detail = [
    source,
    node.memoryReservedBytes !== undefined
      ? `${formatBytes(node.memoryReservedBytes)} reserved by the models served here`
      : undefined,
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <Cell>
      <Text as="p" variant="body-medium" title={detail}>
        {formatBytes(free)} free
      </Text>
      <Text variant="body-small" color="secondary" title={detail}>
        of {formatBytes(node.memoryBudgetBytes)}
      </Text>
    </Cell>
  );
}

/** "3 models · 61 GiB", with the claim and the last scan on hover; a failed scan is flagged. */
function CacheCell({ node }: { node: GpuNode }) {
  const cache = node.cache;
  if (!cache) {
    return <CellText title="—" />;
  }
  const detail = [
    cache.claim ? `Claim ${cache.claim}` : undefined,
    cache.mountPath ? `mounted at ${cache.mountPath}` : undefined,
    cache.shared ? 'shared storage, visible from every node' : undefined,
    cache.scannedAt ? `scanned at ${formatTime(cache.scannedAt)}` : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  const models = cache.models ?? 0;
  return (
    <Cell>
      <Text as="p" variant="body-medium" title={detail}>
        {models} model{models === 1 ? '' : 's'}
        {cache.bytesUsed !== undefined
          ? ` · ${formatBytes(cache.bytesUsed)}`
          : ''}
      </Text>
      {cache.error && (
        <Text
          variant="body-small"
          color="warning"
          title={`The last scan failed: ${cache.error}. The figures may be stale.`}
        >
          scan failed
        </Text>
      )}
    </Cell>
  );
}

function getColumnConfig(
  columns: GpuCapacityColumns = { budget: false, cache: false },
): ColumnConfig<GpuNode>[] {
  const config: ColumnConfig<GpuNode>[] = [
    {
      id: 'name',
      label: 'Node',
      isRowHeader: true,
      isSortable: true,
      cell: node => (
        <CellText
          title={node.name}
          description={node.ready ? undefined : 'Not ready'}
        />
      ),
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: node => <CellText title={node.installation} />,
    },
    {
      id: 'product',
      label: 'GPU',
      isSortable: true,
      cell: node => <CellText title={node.product ?? '—'} />,
    },
    {
      id: 'memory',
      label: 'Memory',
      cell: node => <CellText title={formatGpuMemory(node.memoryMiB)} />,
    },
    {
      id: 'total',
      label: 'GPUs',
      cell: node => {
        const total = gpuTotal(node);
        return total === undefined ? (
          <UnknownCell reason="Neither the device plugin nor gpu-feature-discovery reports a GPU count for this node." />
        ) : (
          <CellText title={String(total)} />
        );
      },
    },
    {
      id: 'allocatable',
      label: 'Allocatable',
      cell: node =>
        node.allocatable === undefined ? (
          <UnknownCell reason={NO_DEVICE_PLUGIN} />
        ) : (
          <CellText title={String(node.allocatable)} />
        ),
    },
    {
      id: 'requested',
      label: 'Requested',
      cell: node => {
        if (node.allocatable === undefined) {
          return <UnknownCell reason={NO_DEVICE_PLUGIN} />;
        }
        return node.requested === undefined ? (
          <UnknownCell reason={NO_POD_DATA} />
        ) : (
          <CellText title={String(node.requested)} />
        );
      },
    },
    {
      id: 'free',
      label: 'Free',
      cell: node => {
        const free = gpuFree(node);
        if (free !== undefined) {
          return <CellText title={String(free)} />;
        }
        return (
          <UnknownCell
            reason={
              node.allocatable === undefined ? NO_DEVICE_PLUGIN : NO_POD_DATA
            }
          />
        );
      },
    },
  ];
  if (columns.budget) {
    config.push({
      id: 'budget',
      label: 'Memory budget',
      cell: node => <BudgetCell node={node} />,
    });
  }
  if (columns.cache) {
    config.push({
      id: 'cache',
      label: 'Model cache',
      cell: node => <CacheCell node={node} />,
    });
  }
  return config;
}

export function sortGpuNodesBy(
  rows: GpuNode[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): GpuNode[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const value = (node: GpuNode): string => {
    switch (column) {
      case 'name':
        return node.name;
      case 'installation':
        return node.installation;
      case 'product':
        return node.product ?? '';
      default:
        return '';
    }
  };
  return [...rows].sort((a, b) => {
    const primary = value(a).localeCompare(value(b)) * factor;
    return primary !== 0
      ? primary
      : `${a.installation}/${a.name}`.localeCompare(
          `${b.installation}/${b.name}`,
        );
  });
}

const UNAVAILABLE_REASON: Record<GpuCapacityUnavailableReason, string> = {
  forbidden: 'you do not have permission to list nodes there',
  error: 'the nodes could not be read',
};

export type GpuCapacityPanelProps = {
  nodes: GpuNode[];
  /** Installations the panel covers (those with a serving backend). */
  installations: string[];
  unavailable: Record<string, GpuCapacityUnavailableReason>;
  isLoading: boolean;
};

/**
 * Per-node GPU capacity on the installations that serve models: what the
 * hardware is (gpu-feature-discovery labels), what the device plugin makes
 * schedulable, and what scheduled pods already hold. Missing device-plugin
 * data is a state the panel explains, not an error.
 */
export function GpuCapacityPanel({
  nodes,
  installations,
  unavailable,
  isLoading,
}: GpuCapacityPanelProps) {
  const columns = useMemo(() => columnsForNodes(nodes), [nodes]);
  const columnConfig = useMemo(() => getColumnConfig(columns), [columns]);
  const { tableProps } = useTable<GpuNode>({
    mode: 'complete',
    data: nodes,
    sortFn: sortGpuNodesBy,
    initialSort: { column: 'installation', direction: 'ascending' },
    paginationOptions: { type: 'none' },
  });

  const unavailableEntries = Object.entries(unavailable).filter(
    ([installation]) => installations.includes(installation),
  );
  const readableInstallations = installations.filter(
    installation => !(installation in unavailable),
  );

  return (
    <InfoCard title="GPU capacity">
      <Flex direction="column" gap="3">
        <Text as="p" variant="body-small" color="secondary">
          GPU product and memory from the gpu-feature-discovery node labels;
          allocatable from the device plugin; free is allocatable minus the GPUs
          scheduled pods request.
          {columns.budget &&
            ' The memory budget is what the serving layer fit-checks a model against, less what the models already served on the node reserve.'}
          {columns.cache &&
            ' The model cache holds pre-warmed downloads; serving one of them skips the download.'}
        </Text>

        {nodes.length > 0 || isLoading || readableInstallations.length === 0 ? (
          <Table<GpuNode>
            {...tableProps}
            columnConfig={columnConfig}
            emptyState={
              <Text variant="body-medium" color="secondary">
                {isLoading ? 'Reading nodes…' : 'No GPU nodes found.'}
              </Text>
            }
          />
        ) : (
          <Text variant="body-medium" color="secondary">
            No GPU nodes found on {readableInstallations.join(', ')}.
          </Text>
        )}

        {unavailableEntries.length > 0 && (
          <Alert
            status="info"
            title="GPU capacity is unavailable for some installations"
            description={unavailableEntries
              .map(
                ([installation, reason]) =>
                  `${installation}: ${UNAVAILABLE_REASON[reason]}`,
              )
              .join('; ')}
          />
        )}
      </Flex>
    </InfoCard>
  );
}
