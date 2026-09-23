import { useMemo } from 'react';
import {
  Alert,
  Button,
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import {
  InfoCard,
  useVisibleSort,
} from '@giantswarm/backstage-plugin-ui-react';
import { installationErrorLine } from '@giantswarm/backstage-plugin-muster';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import { poolPhaseLabel } from '../../lib/poolLifecycle';
import {
  PoolLifecyclePanel,
  type OpenedPool,
  type PoolServeState,
} from './PoolLifecyclePanel';

/** The default order, and the one while the Installation column is hidden. */
const BY_INSTALLATION = {
  column: 'installation',
  direction: 'ascending',
} as const;
const BY_NAME = { column: 'name', direction: 'ascending' } as const;

export type GpuNodePoolsPanelProps = {
  rows: GpuNodePoolRow[];
  isLoading: boolean;
  /** Installations whose cluster-manager reports no Cluster API, with its note. */
  notes: { installation: string; note: string }[];
  errors: { installation: string; error: Error }[];
  onRemove: (row: GpuNodePoolRow) => void;
  /** The pool whose lifecycle panel is open beneath the table, if any. */
  opened: OpenedPool | undefined;
  /** The opened pool's serve intent, where Deploy chose a preset. */
  serve?: PoolServeState;
  /** The row's chevron: open this pool's lifecycle, or close it when it is the open one. */
  onToggleLifecycle: (row: GpuNodePoolRow) => void;
  onCloseLifecycle: () => void;
  /** Columns to leave out: the page drops Installation where it would repeat. */
  hideColumns?: ReadonlyArray<'installation'>;
};

export function sortGpuNodePoolsBy(
  rows: GpuNodePoolRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): GpuNodePoolRow[] {
  const column = String(sort.column);
  const key = (row: GpuNodePoolRow): string => {
    switch (column) {
      case 'installation':
        return `${row.installation} ${row.cluster.name} ${row.pool.name}`;
      case 'cluster':
        return `${row.cluster.name} ${row.pool.name}`;
      case 'accelerator':
        return row.pool.accelerator ?? '';
      case 'phase':
        return poolPhaseLabel(row.pool, row.cluster);
      case 'version':
        return row.pool.version;
      case 'controlPlaneVersion':
        return row.pool.controlPlaneVersion;
      default:
        return row.pool.name;
    }
  };
  const sorted = [...rows].sort((a, b) => key(a).localeCompare(key(b)));
  return sort.direction === 'descending' ? sorted.reverse() : sorted;
}

function getColumnConfig(
  onRemove: (row: GpuNodePoolRow) => void,
  openedId: string | undefined,
  onToggleLifecycle: (row: GpuNodePoolRow) => void,
): ColumnConfig<GpuNodePoolRow>[] {
  return [
    {
      id: 'name',
      label: 'Pool',
      isRowHeader: true,
      isSortable: true,
      cell: row => (
        <CellText title={row.pool.name} description={row.poolName} />
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
      id: 'accelerator',
      label: 'Accelerator',
      isSortable: true,
      cell: row => (
        <CellText
          title={row.pool.accelerator ?? '—'}
          description={row.pool.instanceTypes.join(', ') || undefined}
        />
      ),
    },
    {
      id: 'phase',
      label: 'Status',
      isSortable: true,
      cell: row => <CellText title={poolPhaseLabel(row.pool, row.cluster)} />,
    },
    {
      id: 'version',
      label: 'Pool Kubernetes',
      isSortable: true,
      cell: row => <CellText title={row.pool.version || '—'} />,
    },
    {
      id: 'controlPlaneVersion',
      label: 'Control plane Kubernetes',
      isSortable: true,
      cell: row => <CellText title={row.pool.controlPlaneVersion || '—'} />,
    },
    {
      id: 'actions',
      label: '',
      cell: row => {
        const isOpen = row.id === openedId;
        return (
          <Cell>
            <Flex gap="1" align="center" justify="end">
              <ButtonIcon
                size="small"
                variant="tertiary"
                icon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                aria-label={`${isOpen ? 'Hide' : 'Show'} lifecycle of pool ${row.pool.name}`}
                aria-expanded={isOpen}
                onPress={() => onToggleLifecycle(row)}
              />
              <Button
                size="small"
                variant="secondary"
                onPress={() => onRemove(row)}
                aria-label={`Remove pool ${row.pool.name}`}
              >
                Remove pool
              </Button>
            </Flex>
          </Cell>
        );
      },
    },
  ];
}

/**
 * The GPU node pools cluster-manager owns, from `list_node_pools`: the pool's
 * Kubernetes version and the control plane's as two cells — the tool draws no
 * verdict and neither does the portal — with the pool's phase (`creating`,
 * `ready · 0 nodes` at scale-to-zero, `scaling`, `removing`, `failed · <reason>`)
 * and the accelerator of the owning release. The chevron opens the pool's
 * lifecycle panel beneath the table (the table renders cells only, so the
 * panel sits under it rather than inside the row); Deploy opens it too.
 * **Remove pool** opens the confirm.
 */
export function GpuNodePoolsPanel({
  rows,
  isLoading,
  notes,
  errors,
  onRemove,
  opened,
  serve,
  onToggleLifecycle,
  onCloseLifecycle,
  hideColumns,
}: GpuNodePoolsPanelProps) {
  const columnConfig = useMemo(
    () =>
      getColumnConfig(onRemove, opened?.id, onToggleLifecycle).filter(
        column => !hideColumns?.includes(column.id as 'installation'),
      ),
    [onRemove, opened?.id, onToggleLifecycle, hideColumns],
  );
  const { sort, onSortChange } = useVisibleSort(
    BY_INSTALLATION,
    BY_NAME,
    hideColumns,
  );
  const { tableProps } = useTable<GpuNodePoolRow>({
    mode: 'complete',
    data: rows,
    sortFn: sortGpuNodePoolsBy,
    sort,
    onSortChange,
    paginationOptions: { type: 'none' },
  });
  const openedRow = opened ? rows.find(row => row.id === opened.id) : undefined;

  return (
    <InfoCard title="GPU node pools">
      <Flex direction="column" gap="3">
        <Text as="p" variant="body-small" color="secondary">
          The GPU pools cluster-manager created for the models served here, per
          cluster. A pool runs nodes exactly while something is scheduled on
          them; removing a pool that still runs nodes is refused until the
          models on it are stopped.
        </Text>
        <Table<GpuNodePoolRow>
          {...tableProps}
          columnConfig={columnConfig}
          emptyState={
            <Text variant="body-medium" color="secondary">
              {isLoading ? 'Reading node pools…' : 'No GPU node pools yet.'}
            </Text>
          }
        />
        {opened && (
          <PoolLifecyclePanel
            opened={opened}
            row={openedRow}
            serve={serve}
            onClose={onCloseLifecycle}
          />
        )}
        {notes.length > 0 && (
          <Alert
            status="info"
            title="No clusters to list on some installations"
            description={notes
              .map(({ installation, note }) => `${installation}: ${note}`)
              .join('; ')}
            data-testid="cluster-api-note"
          />
        )}
        {errors.length > 0 && (
          <Alert
            status="info"
            title="Node pools could not be read for some installations"
            description={errors
              .map(({ installation, error }) =>
                installationErrorLine(installation, error),
              )
              .join('; ')}
          />
        )}
      </Flex>
    </InfoCard>
  );
}
