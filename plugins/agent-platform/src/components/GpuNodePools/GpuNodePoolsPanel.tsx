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
import DeleteIcon from '@material-ui/icons/Delete';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import {
  groupNames,
  InfoCard,
  joinNames,
  LoadingIndicator,
  MENU_WIDTH,
  NAMED_IN_SENTENCE,
  SimpleAccordion,
  StackedRowList,
  usePhoneLayout,
  useVisibleSort,
  type StackedRowItem,
} from '@giantswarm/backstage-plugin-ui-react';
import { installationErrorLine } from '@giantswarm/backstage-plugin-muster';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import type { NodeSizePrices } from '../../hooks/useNodeSizePrices';
import { poolPhaseLabel } from '../../lib/poolLifecycle';
import { describeHourlyRange } from '../../lib/poolPricing';
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
  /** What each pool's nodes cost per hour; without it there is no Cost column. */
  prices?: NodeSizePrices;
};

/**
 * The pool's Cost cell: what its running nodes cost now and, under it, what
 * one node costs while it runs — cluster-manager's on-demand list prices. A
 * pool of several sizes shows the range from its cheapest to its dearest.
 */
export function PoolCostCell({
  row,
  prices,
}: {
  row: GpuNodePoolRow;
  prices: NodeSizePrices;
}) {
  const price = prices.priceOf(row);
  if (!price) {
    return (
      <CellText
        title={prices.isReading(row) ? 'Reading…' : '—'}
        description={
          prices.isReading(row) ? undefined : 'No price listed for its sizes'
        }
      />
    );
  }
  return (
    <CellText
      title={`${describeHourlyRange(price.nowMinUSD, price.nowMaxUSD)} now`}
      description={`${describeHourlyRange(
        price.perNodeMinUSD,
        price.perNodeMaxUSD,
      )} per node · ${price.nodes} running`}
    />
  );
}

/**
 * A phone row's cost: what the running nodes cost now, then a node's rate —
 * the two lines of {@link PoolCostCell}, as words.
 */
export function describePoolCost(
  row: GpuNodePoolRow,
  prices: NodeSizePrices,
): { now: string; perNode?: string } {
  const price = prices.priceOf(row);
  if (!price) {
    return {
      now: prices.isReading(row) ? 'reading its price…' : 'no price listed',
    };
  }
  return {
    now: `${describeHourlyRange(price.nowMinUSD, price.nowMaxUSD)} now`,
    perNode: `${describeHourlyRange(
      price.perNodeMinUSD,
      price.perNodeMaxUSD,
    )} per node · ${price.nodes} running`,
  };
}

/** The actions column's width, px: the lifecycle chevron and Remove pool. */
const ACTIONS_COLUMN_WIDTH = 176;

/** The chevron that opens or closes a pool's lifecycle panel beneath the list. */
function LifecycleToggle({
  row,
  isOpen,
  onToggle,
}: {
  row: GpuNodePoolRow;
  isOpen: boolean;
  onToggle: (row: GpuNodePoolRow) => void;
}) {
  return (
    <ButtonIcon
      size="small"
      variant="tertiary"
      icon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      aria-label={`${isOpen ? 'Hide' : 'Show'} lifecycle of pool ${row.pool.name}`}
      aria-expanded={isOpen}
      onPress={() => onToggle(row)}
    />
  );
}

/**
 * One pool as a phone row (T22 B14): the table's nine columns clipped
 * **Remove pool** and the lifecycle chevron off the row.
 *
 * - Line 1: the pool, its phase, the chevron and a ⋯ menu holding Remove pool
 *   (destructive, so in the menu, never a bare button on a phone row).
 * - Line 2: accelerator · cluster · environment · what it costs now.
 * - Under them: the node sizes, the two Kubernetes versions, a node's rate.
 */
export function gpuNodePoolStackedRow(
  row: GpuNodePoolRow,
  {
    isOpen,
    onToggleLifecycle,
    onRemove,
    prices,
    showInstallation,
  }: {
    isOpen: boolean;
    onToggleLifecycle: (row: GpuNodePoolRow) => void;
    onRemove: (row: GpuNodePoolRow) => void;
    prices?: NodeSizePrices;
    showInstallation: boolean;
  },
): StackedRowItem {
  const cost = prices ? describePoolCost(row, prices) : undefined;
  const sizes = row.pool.instanceTypes.join(', ');
  return {
    id: row.id,
    title: row.pool.name,
    status: (
      <Text as="span" variant="body-small" color="secondary">
        {poolPhaseLabel(row.pool, row.cluster)}
      </Text>
    ),
    facts: [
      row.pool.accelerator,
      row.cluster.name,
      showInstallation ? row.installation : undefined,
      cost?.now,
    ],
    details: (
      <Flex direction="column" gap="1">
        {row.poolName && (
          <Text as="p" variant="body-small" color="secondary">
            {row.poolName}
          </Text>
        )}
        {sizes && (
          <Text as="p" variant="body-small" color="secondary">
            Node sizes: {sizes}
          </Text>
        )}
        <Text as="p" variant="body-small" color="secondary">
          Kubernetes {row.pool.version || '—'} · control plane{' '}
          {row.pool.controlPlaneVersion || '—'}
        </Text>
        {cost?.perNode && (
          <Text as="p" variant="body-small" color="secondary">
            {cost.perNode}
          </Text>
        )}
      </Flex>
    ),
    actions: (
      <>
        <LifecycleToggle
          row={row}
          isOpen={isOpen}
          onToggle={onToggleLifecycle}
        />
        <MenuTrigger>
          <ButtonIcon
            size="small"
            variant="tertiary"
            icon={<MoreVertIcon />}
            aria-label={`Actions for pool ${row.pool.name}`}
          />
          <Menu maxWidth={MENU_WIDTH}>
            <MenuItem iconStart={<DeleteIcon />} onAction={() => onRemove(row)}>
              Remove pool
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </>
    ),
  };
}

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
  prices: NodeSizePrices | undefined,
): ColumnConfig<GpuNodePoolRow>[] {
  const costColumn: ColumnConfig<GpuNodePoolRow>[] = prices
    ? [
        {
          id: 'cost',
          label: 'Cost',
          cell: row => <PoolCostCell row={row} prices={prices} />,
        },
      ]
    : [];
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
    ...costColumn,
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
      // Room for the chevron and Remove pool side by side: with the columns
      // shared out equally, nine of them left this cell ~100px at desktop
      // width, and the chevron slid under the version cell beside it, where
      // no click reached it.
      width: ACTIONS_COLUMN_WIDTH,
      cell: row => {
        const isOpen = row.id === openedId;
        return (
          <Cell>
            <Flex gap="1" align="center" justify="end">
              <LifecycleToggle
                row={row}
                isOpen={isOpen}
                onToggle={onToggleLifecycle}
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
  prices,
}: GpuNodePoolsPanelProps) {
  const isPhone = usePhoneLayout();
  const columnConfig = useMemo(
    () =>
      getColumnConfig(onRemove, opened?.id, onToggleLifecycle, prices).filter(
        column => !hideColumns?.includes(column.id as 'installation'),
      ),
    [onRemove, opened?.id, onToggleLifecycle, prices, hideColumns],
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

  let body: ReactNode;
  if (rows.length > 0 && isPhone) {
    // At phone width each pool is a stacked row, in the table's order.
    body = (
      <StackedRowList
        aria-label="GPU node pools"
        rows={(tableProps.data ?? []).map(row =>
          gpuNodePoolStackedRow(row, {
            isOpen: row.id === opened?.id,
            onToggleLifecycle,
            onRemove,
            prices,
            showInstallation: !hideColumns?.includes('installation'),
          }),
        )}
      />
    );
  } else if (rows.length > 0) {
    body = (
      <Table<GpuNodePoolRow> {...tableProps} columnConfig={columnConfig} />
    );
  } else if (isLoading) {
    body = <LoadingIndicator label="Reading node pools…" />;
  } else {
    body = (
      <Text variant="body-medium" color="secondary">
        No GPU node pools yet.
      </Text>
    );
  }

  return (
    <div data-testid="gpu-node-pools-panel">
      <InfoCard title="GPU node pools">
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-small" color="secondary">
            cluster-manager created these pools for the models served here. A
            pool runs nodes only while something is scheduled on them, and it
            can be removed once its models are stopped.
            {prices &&
              " Costs are on-demand list prices for the pool's node sizes."}
          </Text>
          {body}
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
              title="No clusters to list on some environments"
              description={
                <GroupedByInstallation
                  lines={notes.map(({ installation, note }) => ({
                    installation,
                    rest: `: ${note}`,
                  }))}
                />
              }
              data-testid="cluster-api-note"
            />
          )}
          {errors.length > 0 && (
            <Alert
              status="info"
              title="Node pools could not be read for some environments"
              description={
                <GroupedByInstallation
                  lines={errors.map(({ installation, error }) =>
                    splitErrorLine(installation, error),
                  )}
                />
              }
            />
          )}
        </Flex>
      </InfoCard>
    </div>
  );
}

/** A per-installation line, cut after the installation's name. */
type InstallationLine = { installation: string; rest: string };

/**
 * `<installation>: <message>` or `<installation> did not answer…`, as
 * {@link installationErrorLine} words it, split after the name so installations
 * failing the same way share one sentence.
 */
function splitErrorLine(installation: string, error: Error): InstallationLine {
  const line = installationErrorLine(installation, error);
  return line.startsWith(installation)
    ? { installation, rest: line.slice(installation.length) }
    : { installation, rest: `: ${line}` };
}

/**
 * Per-installation lines grouped by what follows the name — fifty clusters
 * without Cluster API read as one sentence, the names capped
 * (`a, b, c, d, e and 45 more: <note>`) — with every line behind a disclosure
 * once there are more than a sentence names.
 */
function GroupedByInstallation({ lines }: { lines: InstallationLine[] }) {
  const sentence = joinNames(
    groupNames(
      lines,
      line => line.installation,
      line => line.rest,
    ).map(({ group, names }) => `${joinNames(names)}${group}`),
    { separator: '; ' },
  );
  if (lines.length <= NAMED_IN_SENTENCE) {
    return <>{sentence}</>;
  }
  return (
    <Flex direction="column" gap="2">
      <span>{sentence}</span>
      <SimpleAccordion
        title={`All ${lines.length} environments`}
        headingLevel={4}
      >
        <Flex direction="column" gap="1">
          {lines.map(({ installation, rest }) => (
            <Text key={installation} variant="body-small">
              {installation}
              {rest}
            </Text>
          ))}
        </Flex>
      </SimpleAccordion>
    </Flex>
  );
}
