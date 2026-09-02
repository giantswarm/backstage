import { useCallback, useMemo, type ReactNode } from 'react';
import {
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { modelDetailRouteRef } from '../../routes';
import { stopRowPress } from '../../lib/rowPress';
import {
  describeServedModel,
  formatBytes,
  formatTime,
  isServedInferenceService,
  lacksToolCalling,
  notableCapabilities,
} from '../../lib/modelManagerServing';
import type { ServedModel } from '../../lib/serving';
import type { WiringState } from '../../hooks/useAutoWireServedModels';
import { ServedReadinessCell } from './servedReadinessStatus';

/** A kagent ModelConfig that fronts a served model. */
export type ServedModelConsumer = {
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
};

/** One row: the served model plus the ModelConfigs pointing at it. */
export type ServedModelRow = ServedModel & {
  usedBy: ServedModelConsumer[];
  /** The auto-wiring's progress for this model, while it has no consumer yet. */
  wiring?: WiringState;
};

/**
 * Rows this portal can stop serving: a KServe InferenceService, whichever
 * source listed it — deleted through model-manager where it operates the row,
 * else as a CR with the user's RBAC. A cached download nobody serves is not
 * one.
 */
export function isStoppable(row: ServedModel): boolean {
  return isServedInferenceService(row);
}

/**
 * Rows the serve flow can start from: a KServe model whose weights sit in a
 * node's cache and that nobody serves — "downloaded on <node>".
 */
export function isServableDownload(row: ServedModel): boolean {
  return (
    row.backend === 'kserve' && row.downloaded === true && !isStoppable(row)
  );
}

/** Human labels for the backends, for the runtime column and tooltips. */
const BACKEND_LABEL: Record<ServedModel['backend'], string> = {
  kserve: 'KServe',
  ollama: 'Ollama',
};

/**
 * Client-side sorting with installation/namespace/name as the stable tiebreaker
 * (same reasoning as ModelsTable).
 */
export function sortServedModelsBy(
  rows: ServedModelRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): ServedModelRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const value = (row: ServedModelRow): string => {
    switch (column) {
      case 'name':
        return row.name;
      case 'readiness':
        return row.readiness;
      case 'modelSource':
        return row.modelSource ?? '';
      case 'runtime':
        return row.runtime ?? '';
      case 'node':
        return row.node ?? '';
      case 'gpuCount':
        return String(row.gpuCount ?? -1).padStart(6, '0');
      case 'sizeBytes':
        return String(row.sizeBytes ?? -1).padStart(16, '0');
      case 'loaded':
        if (row.loaded === undefined) {
          return '-';
        }
        return row.loaded ? '1' : '0';
      case 'endpoint':
        return row.internalUrl ?? row.externalUrl ?? '';
      case 'installation':
        return row.installation;
      default:
        return '';
    }
  };

  return [...rows].sort((a, b) => {
    const primary = value(a).localeCompare(value(b)) * factor;
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
}

/**
 * Which optional columns the rows call for. Every one of them is data the
 * backend either reports or does not: a column nobody has a value for is left
 * out rather than shown as a row of dashes.
 */
export type ServedModelColumns = {
  /** Node and GPUs — the placement columns of a cluster-scheduled backend. */
  placement: boolean;
  /** On-disk size. */
  size: boolean;
  /** In-memory state (loaded, footprint, expiry). */
  memory: boolean;
  /** Model features (tools, vision, …). */
  capabilities: boolean;
};

/**
 * Derive the optional columns from what the rows carry. Placement defaults to
 * shown — a fresh InferenceService has no node *yet* — and is turned off by a
 * caller that knows no installation schedules onto nodes (the section, from
 * the `nodeInventory` capability).
 */
export function columnsForRows(
  rows: ServedModelRow[],
  overrides: Partial<ServedModelColumns> = {},
): ServedModelColumns {
  return {
    placement: overrides.placement ?? true,
    size: overrides.size ?? rows.some(row => row.sizeBytes !== undefined),
    memory: overrides.memory ?? rows.some(row => row.loaded !== undefined),
    capabilities:
      overrides.capabilities ??
      rows.some(row => row.capabilities !== undefined),
  };
}

const NO_TOOLS_TITLE =
  'Agents cannot use this model: it does not support tool calling.';

/** The features a model reports, with a warning where agents cannot use it. */
export function ModelCapabilitiesCell({ row }: { row: ServedModelRow }) {
  if (row.capabilities === undefined) {
    return <CellText title="—" />;
  }
  const notable = notableCapabilities(row.capabilities);
  return (
    <Cell>
      <Flex direction="column" gap="1">
        <Text
          as="p"
          variant="body-medium"
          truncate
          title={row.capabilities.join(', ')}
        >
          {notable.length > 0 ? notable.join(', ') : 'completion only'}
        </Text>
        {lacksToolCalling(row) && (
          <StatusLabel
            label="No tool calling"
            intent="warning"
            icon={ReportProblemIcon}
            title={NO_TOOLS_TITLE}
          />
        )}
      </Flex>
    </Cell>
  );
}

/** Loaded or not, with the footprint and the eviction time while loaded. */
function MemoryCell({ row }: { row: ServedModelRow }) {
  if (row.loaded === undefined) {
    return <CellText title="—" />;
  }
  if (!row.loaded) {
    return (
      <Cell>
        <Text as="p" variant="body-medium" color="secondary">
          Not loaded
        </Text>
      </Cell>
    );
  }
  return (
    <Cell>
      <Text as="p" variant="body-medium">
        Loaded
        {row.memoryBytes !== undefined
          ? ` · ${formatBytes(row.memoryBytes)}`
          : ''}
      </Text>
      {row.loadedUntil && (
        <Text
          variant="body-small"
          color="secondary"
          title={`Evicted from memory at ${row.loadedUntil} unless used`}
        >
          until {formatTime(row.loadedUntil)}
        </Text>
      )}
    </Cell>
  );
}

/** What the "Used by" cell says while the auto-wiring is at work, or stuck. */
function WiringStatus({ wiring }: { wiring: WiringState }) {
  switch (wiring.status) {
    case 'wiring':
      return (
        <Text variant="body-medium" color="secondary">
          Creating model config…
        </Text>
      );
    case 'done':
      return (
        <Text variant="body-medium" color="secondary">
          Model config created
        </Text>
      );
    case 'conflict':
      return (
        <Text variant="body-medium" color="warning" title={wiring.message}>
          Model config name taken
        </Text>
      );
    case 'error':
    default:
      return (
        <Text variant="body-medium" color="danger" title={wiring.message}>
          Model config not created
        </Text>
      );
  }
}

/** The "Used by" cell of a model no ModelConfig points at (yet). */
function UsedByNobody({ wiring }: { wiring?: WiringState }) {
  return wiring ? (
    <WiringStatus wiring={wiring} />
  ) : (
    <Text variant="body-medium" color="secondary">
      No model config
    </Text>
  );
}

/** A ModelConfig to list under "Used by": read from the cluster, or the backend's own. */
export type UsedByEntry = ServedModelConsumer & {
  ready?: boolean;
  message?: string;
  /**
   * What the serving backend says about it, when it knows the ModelConfig:
   * created by it (`true`), or recognised as somebody else's wiring of the
   * same model (`false` — the portal's serve flow, a hand-written one).
   * `undefined` when only the cluster read knows it.
   */
  managed?: boolean;
};

/**
 * The ModelConfigs whose endpoint resolves to this model, plus the one the
 * backend knows for it (exact, and visible even to a user who cannot list
 * ModelConfigs) when the first set does not already have it. Where both know
 * one, the backend's `managed` verdict is kept on the read entry.
 */
export function usedByEntries(row: ServedModelRow): UsedByEntry[] {
  const known = row.modelConfig;
  const entries: UsedByEntry[] = row.usedBy.map(entry =>
    known && entry.namespace === known.namespace && entry.name === known.name
      ? { ...entry, managed: known.managed ?? true }
      : entry,
  );
  if (
    known &&
    !entries.some(
      entry => entry.namespace === known.namespace && entry.name === known.name,
    )
  ) {
    entries.push({
      installation: row.installation,
      namespace: known.namespace,
      name: known.name,
      displayName: known.name,
      ready: known.ready,
      message: known.message,
      managed: known.managed ?? true,
    });
  }
  return entries;
}

/** The tooltip of a "Used by" entry: the ModelConfig, who wired it, and the backend's verdict on it. */
export function describeUsedBy(consumer: UsedByEntry): string {
  let origin = '';
  if (consumer.managed === true) {
    origin = ' · created by model-manager';
  } else if (consumer.managed === false) {
    origin = ' · created outside model-manager';
  }
  // The backend's verdict on a ModelConfig it knows, when the controller has
  // not accepted it yet.
  const verdict =
    consumer.ready === false
      ? ` — ${consumer.message ?? 'not accepted yet'}`
      : '';
  return `ModelConfig ${consumer.namespace}/${consumer.name}${origin}${verdict}`;
}

/** The line under a KServe row's name about its cache: where the weights are. */
function describeCache(row: ServedModelRow): string | undefined {
  if (row.backend !== 'kserve' || row.downloaded === undefined) {
    return undefined;
  }
  if (!row.downloaded) {
    return 'not in the cache';
  }
  return isStoppable(row) ? 'in the cache' : 'downloaded, not serving';
}

function getColumnConfig(
  hrefFor: (consumer: ServedModelConsumer) => string | undefined,
  columns: ServedModelColumns,
  renderActions?: (row: ServedModelRow) => ReactNode,
): ColumnConfig<ServedModelRow>[] {
  const config: ColumnConfig<ServedModelRow>[] = [
    {
      id: 'name',
      label: 'Served model',
      isSortable: true,
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.name}
          description={[
            row.namespace,
            BACKEND_LABEL[row.backend],
            row.preset ? `preset ${row.preset}` : undefined,
            describeCache(row),
            describeServedModel(row.details) || undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ),
    },
    {
      id: 'readiness',
      label: 'Status',
      isSortable: true,
      cell: row => (
        <ServedReadinessCell
          readiness={row.readiness}
          message={row.readinessMessage}
        />
      ),
    },
    {
      id: 'modelSource',
      label: 'Model',
      isSortable: true,
      cell: row => <CellText title={row.modelSource || '—'} />,
    },
    {
      id: 'runtime',
      label: 'Runtime',
      isSortable: true,
      cell: row => <CellText title={row.runtime || '—'} />,
    },
  ];

  if (columns.size) {
    config.push({
      id: 'sizeBytes',
      label: 'Size',
      isSortable: true,
      cell: row => <CellText title={formatBytes(row.sizeBytes)} />,
    });
  }

  if (columns.memory) {
    config.push({
      id: 'loaded',
      label: 'Memory',
      isSortable: true,
      cell: row => <MemoryCell row={row} />,
    });
  }

  if (columns.capabilities) {
    config.push({
      id: 'capabilities',
      label: 'Features',
      cell: row => <ModelCapabilitiesCell row={row} />,
    });
  }

  if (columns.placement) {
    config.push(
      {
        id: 'node',
        label: 'Node',
        isSortable: true,
        cell: row => (
          <Cell>
            <Text
              as="p"
              variant="body-medium"
              truncate
              // The pin is intent, the pod is fact; say which the cell shows.
              title={
                row.nodeSource === 'spec'
                  ? `Pinned by the spec; no running pod yet`
                  : row.node
              }
            >
              {row.node || '—'}
            </Text>
            {row.nodeSource === 'spec' && (
              <Text variant="body-small" color="secondary">
                pinned
              </Text>
            )}
          </Cell>
        ),
      },
      {
        id: 'gpuCount',
        label: 'GPUs',
        isSortable: true,
        cell: row => (
          <CellText
            title={row.gpuCount === undefined ? '—' : String(row.gpuCount)}
          />
        ),
      },
    );
  }

  config.push(
    {
      id: 'endpoint',
      label: 'Endpoint',
      isSortable: true,
      cell: row => (
        <Cell>
          <Text as="p" variant="body-medium" truncate title={row.internalUrl}>
            {row.internalUrl || row.externalUrl || '—'}
          </Text>
          {row.internalUrl && row.externalUrl && (
            <Text
              variant="body-small"
              color="secondary"
              truncate
              title={row.externalUrl}
            >
              {row.externalUrl}
            </Text>
          )}
        </Cell>
      ),
    },
    {
      id: 'usedBy',
      label: 'Used by',
      cell: row => {
        const entries = usedByEntries(row);
        return (
          <Cell>
            {entries.length === 0 ? (
              <UsedByNobody wiring={row.wiring} />
            ) : (
              entries.map(consumer => {
                const href = hrefFor(consumer);
                const label = consumer.displayName;
                const title = describeUsedBy(consumer);
                return href ? (
                  <Link
                    key={`${consumer.namespace}/${consumer.name}`}
                    to={href}
                    title={title}
                    onPointerDown={stopRowPress}
                    onPointerUp={stopRowPress}
                    onClick={stopRowPress}
                  >
                    <Text
                      as="p"
                      variant="body-medium"
                      truncate
                      style={{ color: 'inherit' }}
                    >
                      {label}
                    </Text>
                  </Link>
                ) : (
                  <Text
                    key={`${consumer.namespace}/${consumer.name}`}
                    as="p"
                    variant="body-medium"
                    truncate
                    title={title}
                  >
                    {label}
                  </Text>
                );
              })
            )}
          </Cell>
        );
      },
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: row => <CellText title={row.installation} />,
    },
  );

  // One actions column with one menu per row (`renderActions`), whatever mix
  // of sources listed the row; the section decides what each menu offers. A
  // row with nothing to offer gets an empty cell.
  if (renderActions) {
    config.push({
      id: 'actions',
      label: 'Actions',
      cell: row => (
        <Cell>
          <Flex align="center" gap="1">
            {renderActions(row)}
          </Flex>
        </Cell>
      ),
    });
  }

  return config;
}

export type ServedModelsTableProps = {
  rows: ServedModelRow[];
  /**
   * Force optional columns on or off; anything not given is derived from the
   * rows (`columnsForRows`). The section forces `placement` from the
   * installations' `nodeInventory` capability, so a cluster backend keeps its
   * Node/GPU columns while its models are still pending.
   */
  columns?: Partial<ServedModelColumns>;
  /**
   * The per-row actions menu (serve, stop, load, unload, wire, delete — per
   * the installation's capabilities and the row's state). Rendered in the
   * actions column; absent = no actions column at all (a portal without any
   * write access to the serving layer).
   */
  renderActions?: (row: ServedModelRow) => ReactNode;
};

/**
 * Presentational table of served models. The section owns loading, the
 * unreachable-installations notice, the confirmations and the one actions
 * menu per row; this renders rows, that menu and the empty state. Rows are not clickable: a served
 * model has no page of its own here, the ModelConfigs fronting it are what
 * link onward. Its optional columns follow the data — a backend that reports
 * sizes gets a Size column, one that schedules onto nodes gets Node and GPUs
 * — so a table of Ollama models and a table of InferenceServices each show
 * what they know and no dashes for what they do not.
 */
export function ServedModelsTable({
  rows,
  columns: columnOverrides,
  renderActions,
}: ServedModelsTableProps) {
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);

  const hrefFor = useCallback(
    (consumer: ServedModelConsumer) =>
      modelDetailRoute?.({
        installation: consumer.installation,
        namespace: consumer.namespace,
        name: consumer.name,
      }),
    [modelDetailRoute],
  );

  const columns = useMemo(
    () => columnsForRows(rows, columnOverrides),
    // Key on the override values, not the object identity a caller re-creates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, JSON.stringify(columnOverrides ?? {})],
  );
  const columnConfig = useMemo(
    () => getColumnConfig(hrefFor, columns, renderActions),
    [hrefFor, columns, renderActions],
  );

  const { tableProps } = useTable<ServedModelRow>({
    mode: 'complete',
    data: rows,
    sortFn: sortServedModelsBy,
    initialSort: { column: 'installation', direction: 'ascending' },
    paginationOptions: { type: 'none' },
  });

  return (
    <Table<ServedModelRow>
      {...tableProps}
      columnConfig={columnConfig}
      emptyState={
        <Text variant="body-medium" color="secondary">
          No models are being served.
        </Text>
      }
    />
  );
}
