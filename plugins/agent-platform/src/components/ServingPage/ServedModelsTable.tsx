import { useCallback, useMemo, type ReactNode } from 'react';
import {
  Badge,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { modelDetailRouteRef } from '../../routes';
import { stopRowPress } from '../../lib/rowPress';
import {
  describeServedModel,
  formatBytes,
  formatContextLength,
  formatGpuShare,
  formatTime,
  isServedInferenceService,
  lacksToolCalling,
} from '../../lib/modelManagerServing';
import type { ServedModel, ServingBackend } from '../../lib/serving';
import type { ModelManagerJobPhase } from '../../lib/modelManager';
import type { WiringState } from '../../hooks/useAutoWireServedModels';
import { SERVED_READINESS_PRESENTATION } from './servedReadinessStatus';
import {
  CopyEndpointButton,
  ServedModelsGroupHeader,
} from './ServedModelsGroupHeader';

/** A kagent ModelConfig that fronts a served model. */
export type ServedModelConsumer = {
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
};

/**
 * A pull the backend is running (or that failed), as far as the row needs it:
 * the job to cancel or retry, and its progress. From model-manager's job
 * (`GET /api/v1/jobs`), tagged with nothing the row does not already carry.
 */
export type ServedModelDownload = {
  jobId: string;
  /** `pending` or `running` while in flight; `failed` stays until dismissed. */
  phase: ModelManagerJobPhase;
  /** The backend's progress message, e.g. `pulling manifest`. */
  status?: string;
  bytesCompleted?: number;
  bytesTotal?: number;
  percent?: number;
  /** Why it failed, when it did. */
  error?: string;
  /** Whether the backend creates the model's ModelConfig once the pull is done. */
  wire: boolean;
};

/**
 * One row: the served model plus the ModelConfigs pointing at it — or, with
 * `kind: 'download'`, a pull in flight shown where its model will land: the
 * pulled reference as the name, `downloading` as the readiness, the progress
 * under it ({@link servedModelStatusLines}), and the job's controls in the
 * actions menu instead of the model's. Never operable, never used by anyone.
 */
export type ServedModelRow = ServedModel & {
  usedBy: ServedModelConsumer[];
  /** The auto-wiring's progress for this model, while it has no consumer yet. */
  wiring?: WiringState;
  /** Absent for a served model; `download` for a pull rendered as a row. */
  kind?: 'download';
  /** The pull, on a `download` row. */
  download?: ServedModelDownload;
};

/** A {@link ServedModelRow} that is a pull, not a model. */
export type ServedModelDownloadRow = ServedModelRow & {
  kind: 'download';
  download: ServedModelDownload;
};

/** Whether the row is a pull in flight (or failed) rather than a served model. */
export function isDownloadRow(
  row: ServedModelRow,
): row is ServedModelDownloadRow {
  return row.kind === 'download' && row.download !== undefined;
}

/** A download row's pull is still going: the progress bar shows, Cancel is offered. */
export function isActiveDownload(row: ServedModelRow): boolean {
  return (
    isDownloadRow(row) &&
    (row.download.phase === 'pending' || row.download.phase === 'running')
  );
}

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

/**
 * Client-side sorting with the row id as the stable tiebreaker (same
 * reasoning as ModelsTable). Sorts within a group — every group is its own
 * table.
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
 * The rows of one installation's backend, rendered as one table under one
 * group header. What every row shares — the runtime, the endpoint — is carried
 * by the header and leaves the grid; where the rows differ it stays a column
 * (runtime) or a per-row copy action (endpoint).
 */
export type ServedModelGroup = {
  /** Stable key: installation + backend. */
  key: string;
  installation: string;
  backend: ServingBackend;
  rows: ServedModelRow[];
  /** The one runtime every row of the group reports, else `undefined`. */
  runtime?: string;
  /** The one endpoint every row of the group answers on, else `undefined`. */
  endpoint?: string;
};

/** The one value the rows share; `undefined` when they carry none, or differ. */
function sharedValue(values: (string | undefined)[]): string | undefined {
  const defined = Array.from(
    new Set(values.filter((value): value is string => value !== undefined)),
  );
  return defined.length === 1 ? defined[0] : undefined;
}

/** The URL a client of this row would be pointed at. */
function endpointOf(row: ServedModel): string | undefined {
  return row.internalUrl ?? row.externalUrl;
}

/**
 * Group the rows by installation and backend, in installation order. An
 * installation with two serving sources of different backends (InferenceServices
 * read as CRs next to an Ollama model-manager) is two groups, so a group's
 * header always describes every row under it.
 */
export function groupServedModelRows(
  rows: ServedModelRow[],
): ServedModelGroup[] {
  const groups = new Map<string, ServedModelGroup>();
  for (const row of rows) {
    const key = `${row.installation}/${row.backend}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, {
        key,
        installation: row.installation,
        backend: row.backend,
        rows: [row],
      });
    }
  }
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      runtime: sharedValue(group.rows.map(row => row.runtime)),
      endpoint: sharedValue(group.rows.map(endpointOf)),
    }))
    .sort(
      (a, b) =>
        a.installation.localeCompare(b.installation) ||
        a.backend.localeCompare(b.backend),
    );
}

/**
 * Which optional columns a group's rows call for. Every one of them is data
 * the backend either reports or does not: a column nobody has a value for is
 * left out rather than shown as a row of dashes — and decided per group, so
 * a KServe installation's Node column never puts dashes on an Ollama
 * installation's rows.
 */
export type ServedModelColumns = {
  /**
   * Node and GPUs — shown once a row is placed on, or pinned to, a node.
   * Derived from the rows alone, never from an installation's `nodeInventory`
   * capability: a backend may know its nodes without scheduling models onto
   * them (an Ollama host reporting itself as a node).
   */
  placement: boolean;
  /**
   * Where the weights come from, when that differs from the served name: a
   * Hugging Face id behind an InferenceService. An Ollama tag is both, so the
   * column stays out.
   */
  model: boolean;
  /**
   * The runtime, when the group's rows run on more than one. A single shared
   * runtime is in the group header instead.
   */
  runtime: boolean;
  /** Model features (tools, vision, …). */
  capabilities: boolean;
};

/** Derive the optional columns from what the rows carry. */
export function columnsForRows(rows: ServedModelRow[]): ServedModelColumns {
  return {
    placement: rows.some(row => row.node !== undefined),
    model: rows.some(
      row => row.modelSource !== undefined && row.modelSource !== row.name,
    ),
    runtime:
      new Set(
        rows
          .map(row => row.runtime)
          .filter((runtime): runtime is string => runtime !== undefined),
      ).size > 1,
    capabilities: rows.some(row => row.capabilities !== undefined),
  };
}

/**
 * The memory line of the status cell, from the row alone: `5.4 GiB in memory
 * · 100 % GPU · evicts 22:58` while loaded — the footprint, where it sits
 * (the share on the accelerator, `CPU` when none of it is there; only when
 * the backend reports the split) and the eviction time, as far as the
 * backend reports them — `Not loaded` when the backend knows the model but
 * has not got it in memory, nothing when it has no notion of memory (an
 * InferenceService read as a CR) or is loaded without figures (its status
 * already says so).
 */
export function memoryLine(
  row: Pick<
    ServedModelRow,
    'loaded' | 'memoryBytes' | 'memoryVramBytes' | 'loadedUntil'
  >,
): string | undefined {
  if (row.loaded === undefined) {
    return undefined;
  }
  if (!row.loaded) {
    return 'Not loaded';
  }
  if (row.memoryBytes === undefined && !row.loadedUntil) {
    return undefined;
  }
  const parts = [
    row.memoryBytes !== undefined
      ? `${formatBytes(row.memoryBytes)} in memory`
      : 'In memory',
  ];
  const share = formatGpuShare(row.memoryBytes, row.memoryVramBytes);
  if (share) {
    parts.push(share);
  }
  if (row.loadedUntil) {
    parts.push(`evicts ${formatTime(row.loadedUntil)}`);
  }
  return parts.join(' · ');
}

/**
 * What the figures of the {@link memoryLine} mean, for its tooltip: the
 * footprint is the weights plus the KV cache for the context length the model
 * is loaded with — which is why a 500 MiB download occupies gigabytes — and
 * the share says how much of it sits on the accelerator. Only while loaded
 * with a footprint; the other lines speak for themselves.
 */
export function memoryLineTitle(
  row: Pick<
    ServedModelRow,
    'loaded' | 'memoryBytes' | 'memoryVramBytes' | 'details'
  >,
): string | undefined {
  if (!row.loaded || row.memoryBytes === undefined) {
    return undefined;
  }
  const context = row.details?.contextLength;
  const footprint = `In memory: the weights plus the KV cache for the ${
    context !== undefined
      ? `${formatContextLength(context)} context`
      : 'context length'
  } the model is loaded with.`;
  const share = formatGpuShare(row.memoryBytes, row.memoryVramBytes);
  if (!share) {
    return footprint;
  }
  let where: string;
  if (share === 'CPU') {
    where = 'None of it is on the accelerator — the model runs on the CPU.';
  } else if (share === '100 % GPU') {
    where = 'All of it is on the accelerator (GPU).';
  } else {
    where = `${share.replace(' GPU', '')} of it is on the accelerator (GPU), the rest in system memory.`;
  }
  return `${footprint} ${where}`;
}

/**
 * The percentage of a download, from the backend's figure or — when it
 * reports bytes but no percentage — from the bytes. `undefined` until the
 * total is known.
 */
export function downloadPercent(
  download: Pick<
    ServedModelDownload,
    'bytesCompleted' | 'bytesTotal' | 'percent'
  >,
): number | undefined {
  if (!download.bytesTotal) {
    return undefined;
  }
  const percent =
    download.percent ??
    ((download.bytesCompleted ?? 0) / download.bytesTotal) * 100;
  return Math.min(100, Math.max(0, percent));
}

/**
 * The line under a download row's `Downloading` label, from the job alone:
 * the backend's progress message with the figures — `pulling 6f7f… · 31 % ·
 * 114 MiB / 381 MiB` — as far as it reports them, `Queued` before it starts,
 * `Starting…` while it has said nothing yet; `Download failed: <reason>`
 * under a failed one's `Not ready`.
 */
export function downloadLine(download: ServedModelDownload): string {
  if (download.phase === 'failed') {
    return download.error
      ? `Download failed: ${download.error}`
      : 'Download failed';
  }
  const parts: string[] = [];
  if (download.status) {
    parts.push(download.status);
  }
  const percent = downloadPercent(download);
  if (percent !== undefined && download.bytesTotal) {
    parts.push(`${Math.round(percent)} %`);
    parts.push(
      `${formatBytes(download.bytesCompleted ?? 0)} / ${formatBytes(download.bytesTotal)}`,
    );
  } else if (download.bytesCompleted) {
    parts.push(formatBytes(download.bytesCompleted));
  }
  if (parts.length === 0) {
    return download.phase === 'pending' ? 'Queued' : 'Starting…';
  }
  return parts.join(' · ');
}

/**
 * The lines under the readiness label of {@link ServedModelStatusCell}, each
 * from the row's fields only — no capabilities, no installation lookups — so
 * a row says the same thing wherever it renders. One line at most: a download
 * row's progress ({@link downloadLine}), a served model's memory state
 * ({@link memoryLine}, the GPU share included).
 */
export function servedModelStatusLines(row: ServedModelRow): string[] {
  if (isDownloadRow(row)) {
    return [downloadLine(row.download)];
  }
  const memory = memoryLine(row);
  return memory ? [memory] : [];
}

export type ServedModelStatusCellProps = {
  row: ServedModelRow;
};

/**
 * The one status cell of a served model: the readiness label (vocabulary,
 * intent and icon from `servedReadinessStatus`, the backend's explanation as
 * the tooltip) with the memory state under it — `Ready` / `6.6 GiB in memory
 * · 100 % GPU · evicts 13:05`, `Available` / `Not loaded` — from
 * {@link servedModelStatusLines}, the memory line explained on hover
 * ({@link memoryLineTitle}). What used to be the Memory column, told where
 * the status is. On a download row the line is the pull's progress
 * (`Downloading` / `pulling 6f7f… · 31 % · 114 MiB / 381 MiB`) with a
 * progress bar under it while the pull runs, and the failure in red once it
 * has failed (`Not ready` / `Download failed: …`).
 */
export function ServedModelStatusCell({ row }: ServedModelStatusCellProps) {
  const { label, intent, icon } = SERVED_READINESS_PRESENTATION[row.readiness];
  const lines = servedModelStatusLines(row);
  const memory = memoryLine(row);
  const memoryTitle = memoryLineTitle(row);
  const download = isDownloadRow(row) ? row.download : undefined;
  const percent = download ? downloadPercent(download) : undefined;
  return (
    <Cell>
      <Flex direction="column" gap="1">
        <StatusLabel
          label={label}
          intent={intent}
          icon={icon}
          title={row.readinessMessage}
        />
        {lines.map(line => (
          <Text
            key={line}
            as="p"
            variant="body-small"
            color={download?.phase === 'failed' ? 'danger' : 'secondary'}
            title={line === memory ? memoryTitle : undefined}
          >
            {line}
          </Text>
        ))}
        {isActiveDownload(row) && (
          <LinearProgress
            aria-label={`Downloading ${row.name}`}
            variant={percent === undefined ? 'indeterminate' : 'determinate'}
            value={percent}
          />
        )}
      </Flex>
    </Cell>
  );
}

/**
 * The features worth a chip — what an agent can do with the model. Everything
 * else a backend lists (`completion`, `insert`) is either implied or of no
 * consequence to an agent; the full list stays in the cell's tooltip.
 */
export const FEATURE_CHIPS = ['tools', 'vision', 'thinking', 'embedding'];

const NO_TOOLS_TITLE =
  'Agents cannot use this model: it does not support tool calling.';

/**
 * The features a model reports, as chips for the ones that matter to agents,
 * with a warning icon where the one they need — tool calling — is missing.
 * An empty cell when the backend reports no features for this row.
 */
export function ModelFeaturesCell({ row }: { row: ServedModelRow }) {
  if (row.capabilities === undefined) {
    return <Cell>{null}</Cell>;
  }
  const chips = row.capabilities.filter(capability =>
    FEATURE_CHIPS.includes(capability),
  );
  return (
    <Cell>
      <Flex
        align="center"
        gap="1"
        style={{ flexWrap: 'wrap' }}
        title={row.capabilities.join(', ')}
      >
        {chips.map(capability => (
          <Badge key={capability} size="small">
            {capability}
          </Badge>
        ))}
        {lacksToolCalling(row) && (
          <span
            role="img"
            aria-label="No tool calling"
            title={NO_TOOLS_TITLE}
            style={{
              display: 'inline-flex',
              color: 'var(--bui-fg-warning)',
            }}
          >
            <ReportProblemIcon fontSize="small" />
          </span>
        )}
      </Flex>
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

/**
 * The "Used by" cell of a model no ModelConfig points at (yet). Empty on a
 * download row: nothing points at a pull in flight, the model it produces is
 * the row that gets a "Used by".
 */
function UsedByNobody({ row }: { row: ServedModelRow }) {
  if (isDownloadRow(row)) {
    return null;
  }
  const { wiring } = row;
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

/**
 * The description under a served model's name: namespace, preset, cache
 * state, and what kind of model it is — on-disk size, parameter size,
 * quantisation, context — as far as the backend reports them. The backend
 * itself is in the group header.
 */
export function describeRow(row: ServedModelRow): string {
  return [
    row.namespace,
    row.preset ? `preset ${row.preset}` : undefined,
    describeCache(row),
    row.sizeBytes !== undefined ? formatBytes(row.sizeBytes) : undefined,
    describeServedModel(row.details) || undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The name cell: the served name with its description line and — where the
 * row answers on an endpoint of its own rather than the group's — a copy
 * action for that endpoint, the URL a ModelConfig is pointed at.
 */
function NameCell({
  row,
  sharedEndpoint,
}: {
  row: ServedModelRow;
  sharedEndpoint?: string;
}) {
  const endpoint = endpointOf(row);
  const description = describeRow(row);
  if (!endpoint || endpoint === sharedEndpoint) {
    return <CellText title={row.name} description={description} />;
  }
  return (
    <Cell>
      <Flex direction="column" gap="1">
        <Flex align="center" gap="1">
          <Text as="p" variant="body-medium" truncate title={row.name}>
            {row.name}
          </Text>
          <CopyEndpointButton url={endpoint} />
        </Flex>
        {description && (
          <Text
            variant="body-medium"
            color="secondary"
            truncate
            title={description}
          >
            {description}
          </Text>
        )}
      </Flex>
    </Cell>
  );
}

function getColumnConfig(
  hrefFor: (consumer: ServedModelConsumer) => string | undefined,
  columns: ServedModelColumns,
  sharedEndpoint: string | undefined,
  renderActions?: (row: ServedModelRow) => ReactNode,
): ColumnConfig<ServedModelRow>[] {
  const config: ColumnConfig<ServedModelRow>[] = [
    {
      id: 'name',
      label: 'Served model',
      isSortable: true,
      isRowHeader: true,
      cell: row => <NameCell row={row} sharedEndpoint={sharedEndpoint} />,
    },
    {
      id: 'readiness',
      label: 'Status',
      isSortable: true,
      cell: row => <ServedModelStatusCell row={row} />,
    },
  ];

  if (columns.model) {
    config.push({
      id: 'modelSource',
      label: 'Model',
      isSortable: true,
      // A row whose source is its own name (a cached repository) says nothing
      // twice; one that has none yet says so.
      cell: row => (
        <CellText
          title={row.modelSource === row.name ? '' : (row.modelSource ?? '—')}
        />
      ),
    });
  }

  if (columns.runtime) {
    config.push({
      id: 'runtime',
      label: 'Runtime',
      isSortable: true,
      cell: row => <CellText title={row.runtime ?? '—'} />,
    });
  }

  if (columns.capabilities) {
    config.push({
      id: 'capabilities',
      label: 'Features',
      cell: row => <ModelFeaturesCell row={row} />,
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

  config.push({
    id: 'usedBy',
    label: 'Used by',
    cell: row => {
      const entries = usedByEntries(row);
      return (
        <Cell>
          {entries.length === 0 ? (
            <UsedByNobody row={row} />
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
  });

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

/** One group's rows as a table, its columns derived from those rows alone. */
function ServedModelsGroupTable({
  group,
  hrefFor,
  renderActions,
}: {
  group: ServedModelGroup;
  hrefFor: (consumer: ServedModelConsumer) => string | undefined;
  renderActions?: (row: ServedModelRow) => ReactNode;
}) {
  const columns = useMemo(() => columnsForRows(group.rows), [group.rows]);
  const columnConfig = useMemo(
    () => getColumnConfig(hrefFor, columns, group.endpoint, renderActions),
    [hrefFor, columns, group.endpoint, renderActions],
  );

  const { tableProps } = useTable<ServedModelRow>({
    mode: 'complete',
    data: group.rows,
    sortFn: sortServedModelsBy,
    initialSort: { column: 'name', direction: 'ascending' },
    paginationOptions: { type: 'none' },
  });

  return <Table<ServedModelRow> {...tableProps} columnConfig={columnConfig} />;
}

export type ServedModelsTableProps = {
  rows: ServedModelRow[];
  /**
   * The per-row actions menu (serve, stop, load, unload, wire, delete — per
   * the installation's capabilities and the row's state). Rendered in the
   * actions column; absent = no actions column at all (a portal without any
   * write access to the serving layer).
   */
  renderActions?: (row: ServedModelRow) => ReactNode;
};

/**
 * Presentational table of served models, grouped by installation and backend
 * ({@link groupServedModelRows}): one header per group with what its rows
 * share — backend, runtime version, the endpoint they answer on — and one
 * table under it whose columns follow those rows ({@link columnsForRows}). A
 * backend that schedules onto nodes gets Node and GPUs, one whose weights
 * come from somewhere other than the served name gets Model, one that
 * reports features gets Features; an Ollama installation next to a KServe
 * one shows what it knows and no dashes for what it does not. The section
 * owns loading, the unreachable-installations notice, the confirmations and
 * the one actions menu per row; this renders rows, that menu and the empty
 * state. Rows are not clickable: a served model has no page of its own here,
 * the ModelConfigs fronting it are what link onward.
 */
export function ServedModelsTable({
  rows,
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

  const groups = useMemo(() => groupServedModelRows(rows), [rows]);
  const installations = new Set(groups.map(group => group.installation)).size;

  if (groups.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        No models are being served.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {groups.map(group => (
        <Flex key={group.key} direction="column" gap="2">
          <ServedModelsGroupHeader
            group={group}
            showInstallation={installations > 1}
          />
          <ServedModelsGroupTable
            group={group}
            hrefFor={hrefFor}
            renderActions={renderActions}
          />
        </Flex>
      ))}
    </Flex>
  );
}
