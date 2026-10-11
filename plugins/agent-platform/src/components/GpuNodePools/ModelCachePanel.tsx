import { type ReactNode, useMemo } from 'react';
import {
  Alert,
  Button,
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import {
  InfoCard,
  INITIAL_ROWS,
  LoadingIndicator,
  MENU_WIDTH,
  ShowMore,
  StackedRowList,
  usePhoneLayout,
  useVisibleSort,
  type StackedRowItem,
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
  'No cluster keeps a model cache, so nothing is billed for cached weights.';

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

/** Why a claim cannot be removed here: the installation's cluster-manager is too old. */
export const CACHE_READ_ONLY_REASON =
  "This environment's cluster-manager does not offer remove_model_cache yet (cluster-manager 0.17+).";

/**
 * One claim as a phone row (T22 B16): the table's nine columns clipped
 * **Remove cache** off the row, and its read-only reason lived only in
 * `title=`.
 *
 * - Line 1: the claim, its size, and a ⋯ menu holding Remove cache
 *   (destructive, so in the menu).
 * - Line 2: cluster · zone · environment · what it costs a month · since when.
 * - Under them: what uses it, the volume, the size's tier, and — where the
 *   claim cannot be removed here — why, in words.
 */
export function modelCacheStackedRow(
  row: ModelCacheRow,
  {
    removable,
    onRemove,
    showInstallation,
  }: {
    removable: boolean;
    onRemove: (row: ModelCacheRow) => void;
    showInstallation: boolean;
  },
): StackedRowItem {
  const { claim } = row;
  const size = describeClaimSize(claim);
  const price = describeMonthlyPrice(claim.price);
  const tier = claim.tierNote ?? claim.storageClass;
  const priceSource = describePriceSource(claim);
  return {
    id: `${row.installation}/${row.cluster.name}/${claim.namespace}/${claim.name}`,
    title: claim.name,
    status: size ? (
      <Text as="span" variant="body-small" color="secondary">
        {size}
      </Text>
    ) : undefined,
    facts: [
      row.cluster.name,
      describeWhere(row),
      showInstallation ? row.installation : undefined,
      price ?? 'no price',
      claim.created ? `since ${describeSince(claim.created)}` : undefined,
    ],
    details: (
      <Flex direction="column" gap="1">
        <Text as="p" variant="body-small" color="secondary">
          {describeUse(row)}
        </Text>
        {claim.volume && (
          <Text as="p" variant="body-small" color="secondary">
            Volume {claim.volume}
          </Text>
        )}
        {tier && (
          <Text as="p" variant="body-small" color="secondary">
            {tier}
          </Text>
        )}
        {priceSource && priceSource !== tier && (
          <Text as="p" variant="body-small" color="secondary">
            {claim.price ? `Price: ${priceSource}` : priceSource}
          </Text>
        )}
        {!removable && (
          <Text as="p" variant="body-small" color="secondary">
            Read-only: {CACHE_READ_ONLY_REASON}
          </Text>
        )}
      </Flex>
    ),
    actions: removable ? (
      <MenuTrigger>
        <ButtonIcon
          size="small"
          variant="tertiary"
          icon={<MoreVertIcon />}
          aria-label={`Actions for cache ${claim.name} on ${row.cluster.name}`}
        />
        <Menu maxWidth={MENU_WIDTH}>
          <MenuItem
            color="danger"
            iconStart={<DeleteOutlineIcon />}
            onAction={() => onRemove(row)}
          >
            Remove cache…
          </MenuItem>
        </Menu>
      </MenuTrigger>
    ) : undefined,
  };
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
      label: 'Environment',
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
      label: 'Mount',
      cell: row => <CellText title={describeUse(row)} />,
    },
    {
      id: 'actions',
      label: '',
      // Room for Remove cache: shared out equally with the other columns,
      // the cell was narrower than the button.
      width: 148,
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
                title={CACHE_READ_ONLY_REASON}
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
  const isPhone = usePhoneLayout();
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

  let body: ReactNode;
  if (rows.length > 0) {
    // A page of the sorted claims at a time (list scale). At phone width
    // each claim is a stacked row, in the table's order.
    body = (
      <ShowMore
        items={tableProps.data ?? []}
        initial={INITIAL_ROWS}
        noun="cache claim"
      >
        {visible =>
          isPhone ? (
            <StackedRowList
              aria-label="Model cache claims"
              rows={visible.map(row =>
                modelCacheStackedRow(row, {
                  removable: removable.includes(row.installation),
                  onRemove,
                  showInstallation: !hideColumns?.includes('installation'),
                }),
              )}
            />
          ) : (
            <Table<ModelCacheRow>
              {...tableProps}
              data={visible}
              columnConfig={columnConfig}
            />
          )
        }
      </ShowMore>
    );
  } else if (isLoading) {
    body = <LoadingIndicator label="Reading model caches…" />;
  } else {
    body = (
      <Text variant="body-medium" color="secondary">
        {NO_MODEL_CACHE}
      </Text>
    );
  }

  return (
    <div data-testid="model-cache-panel">
      <InfoCard title="Model cache">
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-small" color="secondary">
            The cache keeps the weights and compiled graphs of a cluster's
            served models, so a model starts about 90 s faster the second time.
            Every pool of the cluster serves from it. The volume outlives the
            pools and is billed every month, filled or not, until you remove it
            here.
            {total ? ` Standing: ${total}.` : ''}
          </Text>
          {body}
          {readOnly.length > 0 && (
            <Alert
              status="info"
              title="Removing needs a newer cluster-manager on some environments"
              description={`${readOnly.join(', ')}: the environment's cluster-manager does not offer remove_model_cache yet (0.17+); the cache is shown as it stands and stays until removed by other means.`}
              data-testid="cache-read-only"
            />
          )}
        </Flex>
      </InfoCard>
    </div>
  );
}
