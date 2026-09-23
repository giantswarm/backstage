import { useMemo } from 'react';
import {
  Alert,
  Button,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import {
  InfoCard,
  useVisibleSort,
} from '@giantswarm/backstage-plugin-ui-react';

import type { ModelCacheRow } from '../../hooks/useClusterManager';
import {
  cacheKeptByCluster,
  describeClaimSize,
  describeMonthlyPrice,
  describePriceSource,
} from '../../lib/clusterManager';

/** The default order, and the one while the Installation column is hidden. */
const BY_INSTALLATION = {
  column: 'installation',
  direction: 'ascending',
} as const;
const BY_CLAIM = { column: 'claim', direction: 'ascending' } as const;

export type ModelCachePanelProps = {
  rows: ModelCacheRow[];
  isLoading: boolean;
  /** The installations whose cluster-manager offers `remove_model_cache` (0.17+). */
  removable: string[];
  onRemove: (row: ModelCacheRow) => void;
  /** Columns to leave out: the page drops Installation where it would repeat. */
  hideColumns?: ReadonlyArray<'installation'>;
};

/** The empty state: no claim stands, nothing is billed. */
export const NO_MODEL_CACHE =
  'No model cache stands on the clusters cluster-manager lists: nothing is billed for cached weights.';

/** `18 Sept 2026` — since when a claim stands. */
export function describeSince(created: string | undefined): string {
  return created
    ? new Date(created).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
}

/** Where a claim stands: its zone once Bound, else its phase. */
export function describeWhere(row: ModelCacheRow): string {
  const { claim } = row;
  if (claim.error) {
    return 'not readable as you';
  }
  if (claim.phase === 'Bound' && claim.zone) {
    return claim.zone;
  }
  return claim.phase ?? 'not Bound';
}

/**
 * What uses the claim: the cluster's serving slice mounts it (every pool
 * serves from it), or nothing does — it is kept, and billed, all the same.
 */
export function describeUse(row: ModelCacheRow): string {
  if (row.claim.mounted) {
    return 'Mounted by the serving slice — every pool of the cluster serves from it';
  }
  if (cacheKeptByCluster(row.cluster)) {
    return 'Kept — the serving slice mounts another claim';
  }
  return 'Kept — nothing mounts it';
}

/**
 * `$27.37/month across 1 claim` — what the listed claims cost together, from
 * the ones that carry a price; the unpriced ones are counted apart.
 */
export function describeTotal(rows: ModelCacheRow[]): string | undefined {
  const priced = rows.filter(row => row.claim.price);
  if (priced.length === 0) {
    return undefined;
  }
  const total = priced.reduce(
    (sum, row) => sum + (row.claim.price?.monthlyUSD ?? 0),
    0,
  );
  const unpriced = rows.length - priced.length;
  return `$${total.toFixed(2)}/month across ${priced.length} claim${
    priced.length === 1 ? '' : 's'
  } at list prices${
    unpriced > 0
      ? `, ${unpriced} more without a price (its tier is not known)`
      : ''
  }`;
}

export function sortModelCacheRowsBy(
  rows: ModelCacheRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): ModelCacheRow[] {
  const column = String(sort.column);
  const key = (row: ModelCacheRow): string => {
    switch (column) {
      case 'installation':
        return `${row.installation} ${row.cluster.name} ${row.claim.name}`;
      case 'cluster':
        return `${row.cluster.name} ${row.claim.name}`;
      case 'since':
        return row.claim.created ?? '';
      default:
        return `${row.claim.name} ${row.installation} ${row.cluster.name}`;
    }
  };
  const sorted = [...rows].sort((a, b) => key(a).localeCompare(key(b)));
  return sort.direction === 'descending' ? sorted.reverse() : sorted;
}

function getColumnConfig(
  removable: string[],
  onRemove: (row: ModelCacheRow) => void,
): ColumnConfig<ModelCacheRow>[] {
  return [
    {
      id: 'claim',
      label: 'Claim',
      isRowHeader: true,
      isSortable: true,
      cell: row => (
        <CellText title={row.claim.name} description={row.claim.namespace} />
      ),
    },
    {
      id: 'installation',
      label: 'Installation',
      isSortable: true,
      cell: row => <CellText title={row.installation} />,
    },
    {
      id: 'cluster',
      label: 'Cluster',
      isSortable: true,
      cell: row => (
        <CellText
          title={row.cluster.name}
          description={row.cluster.organization}
        />
      ),
    },
    {
      id: 'where',
      label: 'Zone',
      cell: row => (
        <CellText
          title={describeWhere(row)}
          description={row.claim.volume ? `volume ${row.claim.volume}` : ''}
        />
      ),
    },
    {
      id: 'size',
      label: 'Size',
      cell: row => (
        <Cell>
          <Text
            as="p"
            variant="body-medium"
            title={row.claim.tierNote ?? row.claim.storageClass}
          >
            {describeClaimSize(row.claim) ?? '—'}
          </Text>
        </Cell>
      ),
    },
    {
      id: 'price',
      label: 'Cost',
      cell: row => (
        <Cell>
          <Text
            as="p"
            variant="body-medium"
            title={describePriceSource(row.claim)}
            data-testid="cache-price"
          >
            {describeMonthlyPrice(row.claim.price) ?? 'no price'}
          </Text>
          {!row.claim.price && (
            <Text variant="body-small" color="secondary">
              {row.claim.priceNote ?? row.claim.tierNote ?? ''}
            </Text>
          )}
        </Cell>
      ),
    },
    {
      id: 'since',
      label: 'Since',
      isSortable: true,
      cell: row => <CellText title={describeSince(row.claim.created)} />,
    },
    {
      id: 'use',
      label: 'Used by',
      cell: row => <CellText title={describeUse(row)} />,
    },
    {
      id: 'actions',
      label: '',
      cell: row => (
        <Cell>
          <Flex justify="end">
            {removable.includes(row.installation) ? (
              <Button
                size="small"
                variant="secondary"
                onPress={() => onRemove(row)}
                aria-label={`Remove cache ${row.claim.name} on ${row.cluster.name}`}
              >
                Remove cache
              </Button>
            ) : (
              <Text
                variant="body-small"
                color="secondary"
                title="This installation's cluster-manager does not offer remove_model_cache yet (cluster-manager 0.17+)."
              >
                read-only
              </Text>
            )}
          </Flex>
        </Cell>
      ),
    },
  ];
}

/**
 * The model cache claims of the clusters cluster-manager lists, pool or not
 * (giantswarm/backstage#2493): a claim is a gp3 volume that outlives every
 * pool and the serving slice by design and is billed every month it exists,
 * filled or not — so the card names each with its size, tier and monthly
 * list price as cluster-manager reads them, since when it stands, and what
 * uses it. **Remove cache** opens the confirm; an installation whose
 * cluster-manager predates the tool shows its claims read-only.
 */
export function ModelCachePanel({
  rows,
  isLoading,
  removable,
  onRemove,
  hideColumns,
}: ModelCachePanelProps) {
  const columnConfig = useMemo(
    () =>
      getColumnConfig(removable, onRemove).filter(
        column => !hideColumns?.includes(column.id as 'installation'),
      ),
    [removable, onRemove, hideColumns],
  );
  const { sort, onSortChange } = useVisibleSort(
    BY_INSTALLATION,
    BY_CLAIM,
    hideColumns,
  );
  const { tableProps } = useTable<ModelCacheRow>({
    mode: 'complete',
    data: rows,
    sortFn: sortModelCacheRowsBy,
    sort,
    onSortChange,
    paginationOptions: { type: 'none' },
  });
  const total = useMemo(() => describeTotal(rows), [rows]);
  const readOnly = useMemo(
    () =>
      [...new Set(rows.map(row => row.installation))].filter(
        installation => !removable.includes(installation),
      ),
    [rows, removable],
  );

  return (
    <div data-testid="model-cache-panel">
      <InfoCard title="Model cache">
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-small" color="secondary">
            A model cache keeps the weights and compiled graphs of the models
            served on a cluster, so a model starts about 90 s faster the second
            time. It is a volume that stays after the pools are removed and is
            billed every month it exists, filled or not — until it is removed
            here. Every pool of a cluster serves from the cluster's cache.
            {total ? ` Standing: ${total}.` : ''}
          </Text>
          <Table<ModelCacheRow>
            {...tableProps}
            columnConfig={columnConfig}
            emptyState={
              <Text variant="body-medium" color="secondary">
                {isLoading ? 'Reading model caches…' : NO_MODEL_CACHE}
              </Text>
            }
          />
          {readOnly.length > 0 && (
            <Alert
              status="info"
              title="Removing needs a newer cluster-manager on some installations"
              description={`${readOnly.join(', ')}: the installation's cluster-manager does not offer remove_model_cache yet (0.17+); the cache is shown as it stands and stays until removed by other means.`}
              data-testid="cache-read-only"
            />
          )}
        </Flex>
      </InfoCard>
    </div>
  );
}
