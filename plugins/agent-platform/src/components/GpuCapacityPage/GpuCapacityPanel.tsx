import { useMemo, type ReactElement } from 'react';
import {
  Alert,
  Badge,
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
  isHostMemoryNode,
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

/**
 * A figure this kind of node does not have at all — not unknown, not there:
 * a backend host has no GPU product, count or device-plugin figure to read.
 * A dash, with what the row is instead on hover.
 */
function NotReportedCell({ reason }: { reason: string }) {
  return (
    <Cell>
      <Text as="p" variant="body-medium" color="secondary" title={reason}>
        —
      </Text>
    </Cell>
  );
}

const NO_DEVICE_PLUGIN =
  'The node advertises no accelerator resource (nvidia.com/gpu or the like) — no device plugin is running, so only the discovery labels are known.';
const NO_POD_DATA =
  'The pods on this node could not be read, so scheduled GPU requests are unknown.';
const HOST_NO_GPU_FIGURES =
  "The host a serving backend runs on, not a cluster node: the backend's API does not expose the accelerator, so there is no GPU product, count or device-plugin figure for it. Its budget is the host's memory as the serving layer sees it.";

/** What the node name's description says for a backend host. */
export const HOST_NODE_DESCRIPTION = 'Backend host';

/** What the node name's description says for a node the serving layer will not place a model on. */
export const NOT_SERVING_TARGET_DESCRIPTION = 'Not a serving target';
const NOT_SERVING_TARGET_NO_REASON = 'the serving layer gave no reason';

/** The hint in an empty cache cell when another node of the installation holds the cache. */
export const NO_CACHE_ON_NODE_HINT = 'no model cache on this node';
const NO_CACHE_ON_NODE_TITLE =
  'Another node of this installation holds the model cache. Whether a model can be served here depends on that cache claim being mountable from this node — a node-local claim is not. The serving layer says which nodes are serving targets from model-manager 0.11 on; this one did not.';

/**
 * "Not a serving target: <reason>" for a node the serving layer will not
 * place a model on — the node cell's and the budget cell's tooltip.
 */
function eligibilityDetail(node: GpuNode): string | undefined {
  return node.eligible === false
    ? `${NOT_SERVING_TARGET_DESCRIPTION}: ${
        node.eligibilityReason ?? NOT_SERVING_TARGET_NO_REASON
      }`
    : undefined;
}

/**
 * Whether a cluster node the serving layer has not judged (`eligible`
 * unknown) has no model cache while another node of its installation holds a
 * node-local one — the softer hint that it may not be a serving target: on a
 * single-claim cache layout presets pinned to the cache's node cannot land
 * here, and only the serving layer's own verdict (model-manager 0.11 on)
 * settles it.
 */
export function lacksInstallationCache(
  node: GpuNode,
  nodes: GpuNode[],
): boolean {
  return (
    node.eligible === undefined &&
    node.cache === undefined &&
    !isHostMemoryNode(node) &&
    nodes.some(
      other =>
        other.installation === node.installation &&
        other.id !== node.id &&
        other.cache !== undefined &&
        !other.cache.shared,
    )
  );
}

/** The marker on a host where a loaded model sits on the accelerator. */
export const ACCELERATED_LABEL = 'accelerated';
const ACCELERATED_TITLE =
  "At least one loaded model has memory on the accelerator (GPU); the Serving view shows each model's share.";

/** How each memory budget was derived, for the budget cell's tooltip. */
const BUDGET_SOURCE: Record<string, string> = {
  'gpu-labels': 'Budget: the GPU memory from the node labels',
  allocatable:
    'Budget: the allocatable node memory (no GPU memory label — a unified-memory or CPU node)',
  annotation: 'Budget: set by the memory-budget annotation on the node',
  'host-meminfo':
    "Budget: the host's memory (MemTotal of /proc/meminfo as the serving layer's pod sees it) — the backend's API does not expose the accelerator, so on a unified-memory machine this is what the loaded models share",
  override:
    "Budget: set by the operator (ollama.memoryBudgetGiB on the serving layer's chart), not read from the host — for a pod whose /proc/meminfo is not the host's memory (a VM-backed container runtime, a backend on another machine)",
};

/** The optional columns, shown when any node reports the data. */
export type GpuCapacityColumns = {
  /**
   * GPU product, memory, count and the device-plugin figures — what cluster
   * nodes carry. A fleet of backend hosts alone (an Ollama laptop) has none of
   * it, and the columns would only read "—".
   */
  gpu: boolean;
  /** The memory budget a serving backend fit-checks against (model-manager). */
  budget: boolean;
  /** The download cache on the node (model-manager). */
  cache: boolean;
};

export function columnsForNodes(nodes: GpuNode[]): GpuCapacityColumns {
  return {
    // Kept while nothing is listed yet, so the header does not jump once the
    // nodes arrive.
    gpu: nodes.length === 0 || nodes.some(node => !isHostMemoryNode(node)),
    budget: nodes.some(node => node.memoryBudgetBytes !== undefined),
    cache: nodes.some(node => node.cache !== undefined),
  };
}

/**
 * Under the node name: a fault first, then that the serving layer will not
 * place a model here, else what kind of node this is when it is not a
 * cluster node.
 */
export function describeNode(node: GpuNode): string | undefined {
  if (!node.ready) {
    return 'Not ready';
  }
  if (node.eligible === false) {
    return NOT_SERVING_TARGET_DESCRIPTION;
  }
  return isHostMemoryNode(node) ? HOST_NODE_DESCRIPTION : undefined;
}

/**
 * The node name with {@link describeNode} under it. A node that is not a
 * serving target is dimmed, and the serving layer's reason is on hover.
 */
function NodeCell({ node }: { node: GpuNode }) {
  const description = describeNode(node);
  const ineligible = node.eligible === false;
  return (
    <Cell>
      <Text
        as="p"
        variant="body-medium"
        color={ineligible ? 'secondary' : undefined}
        truncate
        title={node.name}
      >
        {node.name}
      </Text>
      {description && (
        <Text
          variant="body-medium"
          color="secondary"
          truncate
          title={ineligible ? eligibilityDetail(node) : description}
        >
          {description}
        </Text>
      )}
    </Cell>
  );
}

/**
 * "80.6 GiB free" / "of 86.1 GiB · 5.0 GiB reserved", with the source of the
 * budget and the backend's own note on hover, and the accelerated marker on a
 * host where a loaded model sits on the GPU.
 */
function BudgetCell({ node }: { node: GpuNode }) {
  if (node.memoryBudgetBytes === undefined) {
    return <CellText title="—" />;
  }
  const free = node.memoryFreeBytes ?? node.memoryBudgetBytes;
  const detail = [
    node.memoryBudgetSource
      ? BUDGET_SOURCE[node.memoryBudgetSource]
      : undefined,
    eligibilityDetail(node),
    node.memoryReservedBytes !== undefined
      ? `${formatBytes(node.memoryReservedBytes)} reserved by the models ${
          isHostMemoryNode(node) ? 'loaded' : 'served'
        } here`
      : undefined,
    node.accelerated === false
      ? 'no loaded model is on the accelerator right now'
      : undefined,
    node.memoryBudgetNote,
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <Cell>
      <Flex align="center" gap="1" style={{ flexWrap: 'wrap' }}>
        <Text as="p" variant="body-medium" title={detail}>
          {formatBytes(free)} free
        </Text>
        {node.accelerated === true && (
          <Badge size="small" title={ACCELERATED_TITLE}>
            {ACCELERATED_LABEL}
          </Badge>
        )}
      </Flex>
      <Text variant="body-small" color="secondary" title={detail}>
        of {formatBytes(node.memoryBudgetBytes)}
        {node.memoryReservedBytes !== undefined
          ? ` · ${formatBytes(node.memoryReservedBytes)} reserved`
          : ''}
      </Text>
    </Cell>
  );
}

/**
 * "3 models · 61 GiB", with the claim and the last scan on hover; a failed
 * scan is flagged. A node without a cache reads "—", or the softer hint that
 * the installation's cache sits on another node
 * ({@link lacksInstallationCache}).
 */
function CacheCell({
  node,
  noCacheHint,
}: {
  node: GpuNode;
  noCacheHint: boolean;
}) {
  const cache = node.cache;
  if (!cache) {
    return noCacheHint ? (
      <Cell>
        <Text
          as="p"
          variant="body-medium"
          color="secondary"
          title={NO_CACHE_ON_NODE_TITLE}
        >
          {NO_CACHE_ON_NODE_HINT}
        </Text>
      </Cell>
    ) : (
      <CellText title="—" />
    );
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

/**
 * A GPU figure's cell for cluster nodes; a backend host, which has no such
 * figure, gets the dash that says what it is instead.
 */
function gpuFigure(
  render: (node: GpuNode) => ReactElement,
): (node: GpuNode) => ReactElement {
  return node =>
    isHostMemoryNode(node) ? (
      <NotReportedCell reason={HOST_NO_GPU_FIGURES} />
    ) : (
      render(node)
    );
}

function getColumnConfig(
  columns: GpuCapacityColumns = { gpu: true, budget: false, cache: false },
  /** Ids of the nodes whose empty cache cell carries the softer hint. */
  noCacheHints: ReadonlySet<string> = new Set(),
): ColumnConfig<GpuNode>[] {
  const config: ColumnConfig<GpuNode>[] = [
    {
      id: 'name',
      label: 'Node',
      isRowHeader: true,
      isSortable: true,
      cell: node => <NodeCell node={node} />,
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: node => <CellText title={node.installation} />,
    },
  ];
  if (columns.gpu) {
    config.push(
      {
        id: 'product',
        label: 'GPU',
        isSortable: true,
        // The product from the discovery labels; without them, the resource
        // the device plugin advertises (`amd.com/gpu`) still names the kind.
        cell: gpuFigure(node => (
          <CellText title={node.product ?? node.resource ?? '—'} />
        )),
      },
      {
        id: 'memory',
        label: 'Memory',
        cell: gpuFigure(node => (
          <CellText title={formatGpuMemory(node.memoryMiB)} />
        )),
      },
      {
        id: 'total',
        label: 'GPUs',
        cell: gpuFigure(node => {
          const total = gpuTotal(node);
          return total === undefined ? (
            <UnknownCell reason="Neither the device plugin nor gpu-feature-discovery reports a GPU count for this node." />
          ) : (
            <CellText title={String(total)} />
          );
        }),
      },
      {
        id: 'allocatable',
        label: 'Allocatable',
        cell: gpuFigure(node =>
          node.allocatable === undefined ? (
            <UnknownCell reason={NO_DEVICE_PLUGIN} />
          ) : (
            <CellText title={String(node.allocatable)} />
          ),
        ),
      },
      {
        id: 'requested',
        label: 'Requested',
        cell: gpuFigure(node => {
          if (node.allocatable === undefined) {
            return <UnknownCell reason={NO_DEVICE_PLUGIN} />;
          }
          return node.requested === undefined ? (
            <UnknownCell reason={NO_POD_DATA} />
          ) : (
            <CellText title={String(node.requested)} />
          );
        }),
      },
      {
        id: 'free',
        label: 'Free',
        cell: gpuFigure(node => {
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
        }),
      },
    );
  }
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
      cell: node => (
        <CacheCell node={node} noCacheHint={noCacheHints.has(node.id)} />
      ),
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
 * data is a state the panel explains, not an error. The host a backend runs
 * on (Ollama, through model-manager) is a row of its own kind: no GPU
 * figures at all — its API does not expose the accelerator — but the host's
 * memory as the budget, what the loaded models take of it, and a marker when
 * one of them sits on the GPU; a fleet of such hosts shows no GPU columns.
 * A node the serving layer will not place a model on (`eligible: false`) is
 * dimmed and says so under its name, the reason on hover; where the layer
 * gives no verdict, a node without a cache beside one that holds it gets the
 * softer hint in its cache cell.
 */
export function GpuCapacityPanel({
  nodes,
  installations,
  unavailable,
  isLoading,
}: GpuCapacityPanelProps) {
  const columns = useMemo(() => columnsForNodes(nodes), [nodes]);
  const noCacheHints = useMemo(
    () =>
      new Set(
        nodes
          .filter(node => lacksInstallationCache(node, nodes))
          .map(node => node.id),
      ),
    [nodes],
  );
  const columnConfig = useMemo(
    () => getColumnConfig(columns, noCacheHints),
    [columns, noCacheHints],
  );
  const hasHost = useMemo(() => nodes.some(isHostMemoryNode), [nodes]);
  const hasIneligible = useMemo(
    () => nodes.some(node => node.eligible === false),
    [nodes],
  );
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
          {columns.gpu &&
            'GPU product and memory from the gpu-feature-discovery node labels; allocatable from the device plugin; free is allocatable minus the GPUs scheduled pods request.'}
          {columns.budget &&
            ' The memory budget is what the serving layer fit-checks a model against, less what the models already served on the node reserve.'}
          {hasHost &&
            " A backend host has no GPU figures — its API does not expose the accelerator: its budget is the host's memory as the serving layer sees it, and accelerated marks a host where a loaded model sits on the GPU."}
          {columns.cache &&
            ' The model cache holds pre-warmed downloads; serving one of them skips the download.'}
          {hasIneligible &&
            ' A node marked not a serving target is one the serving layer will not place a model on — outside its node selector, or unable to mount the model cache; the reason is on hover.'}
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
