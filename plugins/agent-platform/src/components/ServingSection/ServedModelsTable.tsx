import { useCallback, useMemo } from 'react';
import {
  Cell,
  CellText,
  ColumnConfig,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { modelDetailRouteRef } from '../../routes';
import { stopRowPress } from '../../lib/rowPress';
import type { ServedModel } from '../../lib/serving';
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
};

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

function getColumnConfig(
  hrefFor: (consumer: ServedModelConsumer) => string | undefined,
): ColumnConfig<ServedModelRow>[] {
  return [
    {
      id: 'name',
      label: 'Served model',
      isSortable: true,
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.name}
          description={
            row.namespace
              ? `${row.namespace} · ${BACKEND_LABEL[row.backend]}`
              : BACKEND_LABEL[row.backend]
          }
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
      cell: row => (
        <Cell>
          {row.usedBy.length === 0 ? (
            <Text variant="body-medium" color="secondary">
              No model config
            </Text>
          ) : (
            row.usedBy.map(consumer => {
              const href = hrefFor(consumer);
              const label = consumer.displayName;
              return href ? (
                <Link
                  key={`${consumer.namespace}/${consumer.name}`}
                  to={href}
                  title={`ModelConfig ${consumer.namespace}/${consumer.name}`}
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
                >
                  {label}
                </Text>
              );
            })
          )}
        </Cell>
      ),
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: row => <CellText title={row.installation} />,
    },
  ];
}

export type ServedModelsTableProps = {
  rows: ServedModelRow[];
};

/**
 * Presentational, read-only table of served models. The section owns loading
 * and the unreachable-installations notice; this renders rows and the empty
 * state. Rows are not clickable: a served model has no page of its own here,
 * the ModelConfigs fronting it are what link onward.
 */
export function ServedModelsTable({ rows }: ServedModelsTableProps) {
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

  const columnConfig = useMemo(() => getColumnConfig(hrefFor), [hrefFor]);

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
