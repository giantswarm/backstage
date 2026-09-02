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
import { useNavigate } from 'react-router-dom';
import type {
  ModelConfig,
  ModelConfigReadiness,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { modelDetailRouteRef } from '../../routes';
import { stopRowPress } from '../../lib/rowPress';
import type { ServedModel, ServedModelReadiness } from '../../lib/serving';
import { ModelReadinessCell } from './readinessStatus';

/**
 * The served model (e.g. a KServe InferenceService) a ModelConfig's endpoint
 * points at, when it is one this portal can see — the link from the agents'
 * side of the Models tab to the serving side.
 */
export type ModelServedBy = {
  name: string;
  namespace?: string;
  backend: ServedModel['backend'];
  readiness: ServedModelReadiness;
};

export function toModelServedBy(served: ServedModel): ModelServedBy {
  return {
    name: served.name,
    namespace: served.namespace,
    backend: served.backend,
    readiness: served.readiness,
  };
}

const SERVED_BY_BACKEND_LABEL: Record<ServedModel['backend'], string> = {
  kserve: 'InferenceService',
  ollama: 'Ollama model',
};

const SERVED_BY_READINESS_LABEL: Record<ServedModelReadiness, string> = {
  ready: 'ready',
  available: 'available (not loaded)',
  notReady: 'not ready',
  pending: 'pending',
};

/** One list row — plain data derived once, so sorting works on strings. */
export type ModelRow = {
  /** Stable unique key: installation + namespace + resource name. */
  id: string;
  installation: string;
  name: string;
  namespace: string;
  displayName: string;
  provider: string;
  model: string;
  /** The configured base URL/host; empty = the provider's default endpoint. */
  endpoint: string;
  readiness: ModelConfigReadiness;
  /** The controller's own explanation, for the status tooltip. */
  readinessMessage?: string;
  /** The in-cluster served model behind `endpoint`, when known. */
  servedBy?: ModelServedBy;
};

export function toModelRow(
  modelConfig: ModelConfig,
  servedBy?: ModelServedBy,
): ModelRow {
  return {
    id: `${modelConfig.cluster}/${modelConfig.getNamespace() ?? ''}/${modelConfig.getName()}`,
    installation: modelConfig.cluster,
    name: modelConfig.getName(),
    namespace: modelConfig.getNamespace() ?? '',
    displayName: modelConfig.getDisplayName(),
    provider: modelConfig.getProvider() ?? '',
    model: modelConfig.getModel() ?? '',
    endpoint: modelConfig.getEndpoint() ?? '',
    readiness: modelConfig.getReadiness(),
    readinessMessage: modelConfig.getAcceptedCondition()?.message,
    ...(servedBy ? { servedBy } : {}),
  };
}

/**
 * Client-side sorting. Every column falls back to installation/namespace/name
 * as a tiebreaker so equal values keep a stable, readable order rather than
 * the arbitrary one the fleet queries happened to resolve in.
 */
export function sortModelsBy(
  rows: ModelRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): ModelRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;
  const value = (row: ModelRow): string => {
    switch (column) {
      case 'name':
        return row.displayName;
      case 'provider':
        return row.provider;
      case 'model':
        return row.model;
      case 'endpoint':
        return row.endpoint;
      case 'readiness':
        return row.readiness;
      case 'installation':
        return row.installation;
      default:
        return '';
    }
  };

  return [...rows].sort((a, b) => {
    const primary = value(a).localeCompare(value(b)) * factor;
    // The tiebreaker stays ascending regardless of direction, so reversing a
    // sort does not shuffle rows that compare equal.
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
}

function getColumnConfig(
  hrefFor: (row: ModelRow) => string | undefined,
): ColumnConfig<ModelRow>[] {
  return [
    {
      id: 'name',
      label: 'Model config',
      isSortable: true,
      isRowHeader: true,
      cell: row => {
        const href = hrefFor(row);

        // A real anchor on the name, *as well as* the whole-row onClick below —
        // same two affordances (and the same colour handling) as AgentsTable's
        // name cell.
        return (
          <Cell>
            {href ? (
              <Link
                to={href}
                title={row.displayName}
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
                  {row.displayName}
                </Text>
              </Link>
            ) : (
              <Text
                as="p"
                variant="body-medium"
                truncate
                title={row.displayName}
              >
                {row.displayName}
              </Text>
            )}
            {row.displayName !== row.name && (
              <Text
                variant="body-small"
                color="secondary"
                truncate
                title={row.name}
              >
                {row.name}
              </Text>
            )}
          </Cell>
        );
      },
    },
    {
      id: 'readiness',
      label: 'Status',
      isSortable: true,
      cell: row => <ModelReadinessCell row={row} />,
    },
    {
      id: 'provider',
      label: 'Provider',
      isSortable: true,
      cell: row => <CellText title={row.provider || '—'} />,
    },
    {
      id: 'model',
      label: 'Model',
      isSortable: true,
      cell: row => <CellText title={row.model || '—'} />,
    },
    {
      id: 'endpoint',
      label: 'Endpoint',
      isSortable: true,
      // Empty means the provider's own default endpoint, which is worth saying
      // rather than leaving a blank that reads as "unknown". When the endpoint
      // is a served model this portal can see, say which — that is the link
      // between a ModelConfig and the InferenceService behind it.
      cell: row => (
        <Cell>
          <Text
            as="p"
            variant="body-medium"
            truncate
            title={row.endpoint || undefined}
          >
            {row.endpoint || 'Provider default'}
          </Text>
          {row.servedBy && (
            <Text
              variant="body-small"
              color="secondary"
              truncate
              title={`${SERVED_BY_BACKEND_LABEL[row.servedBy.backend]} ${
                row.servedBy.namespace ? `${row.servedBy.namespace}/` : ''
              }${row.servedBy.name} is ${
                SERVED_BY_READINESS_LABEL[row.servedBy.readiness]
              } — see the Serving view`}
            >
              Served by {SERVED_BY_BACKEND_LABEL[row.servedBy.backend]}{' '}
              {row.servedBy.namespace ? `${row.servedBy.namespace}/` : ''}
              {row.servedBy.name}
            </Text>
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

export type ModelsTableProps = {
  rows: ModelRow[];
};

/**
 * Presentational table of ModelConfigs. The page owns loading and the
 * unreachable-installations notice; this only renders the rows and the empty
 * state. Pagination stays off for the same reason as AgentsTable.
 */
export function ModelsTable({ rows }: ModelsTableProps) {
  const navigate = useNavigate();
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);

  // All three parameters are needed: a ModelConfig name is only unique within
  // a namespace on one installation. Undefined when the route isn't bound, in
  // which case rows render as plain text rather than as links that go nowhere.
  const hrefFor = useCallback(
    (row: ModelRow) =>
      modelDetailRoute?.({
        installation: row.installation,
        namespace: row.namespace,
        name: row.name,
      }),
    [modelDetailRoute],
  );

  const columnConfig = useMemo(() => getColumnConfig(hrefFor), [hrefFor]);

  const { tableProps } = useTable<ModelRow>({
    mode: 'complete',
    data: rows,
    sortFn: sortModelsBy,
    initialSort: { column: 'installation', direction: 'ascending' },
    paginationOptions: { type: 'none' },
  });

  return (
    <Table<ModelRow>
      {...tableProps}
      columnConfig={columnConfig}
      rowConfig={{
        // Whole-row click as a convenience, on top of the anchor on the name.
        // `onClick` + navigate rather than `getHref` — without BUIProvider a
        // bui href does a full page reload (see AgentsTable).
        onClick: row => {
          const href = hrefFor(row);
          if (href) {
            navigate(href);
          }
        },
      }}
      emptyState={
        <Text variant="body-medium" color="secondary">
          No models found.
        </Text>
      }
    />
  );
}
