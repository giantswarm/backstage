import { useCallback, useMemo, type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { Cell, type ColumnConfig, Table, Text } from '@backstage/ui';
import {
  formatLocalDateFull,
  getRelativeDate,
  StackedRowList,
  StatusDot,
  type FittingTier,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  formatNodesReady,
  formatZones,
  isShortOfNodes,
  kindLabel,
  type PlatformNodePool,
  zonesTitle,
} from '../utils/nodePools';

const useStyles = makeStyles({
  // The selected pool's row, tinted as the design has it. The row has no
  // hook of its own in bui's Table, so it is found by its pressed button.
  table: {
    '& tr:has([aria-pressed="true"])': {
      backgroundColor: 'var(--bui-bg-neutral-2)',
    },
  },
  // The pool's name: a button that selects the pool, drawn as the shell's
  // links are, since pressing it changes what the page shows below.
  poolButton: {
    border: 0,
    background: 'transparent',
    padding: 0,
    font: 'inherit',
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'pointer',
    color: 'var(--agent-shell-link, var(--bui-fg-primary))',
    textDecorationLine: 'underline',
    textDecorationThickness: 1,
    textUnderlineOffset: '0.15em',
    overflowWrap: 'anywhere',
    '&:hover': {
      color: 'var(--agent-shell-link-hover, var(--bui-fg-primary))',
      textDecorationThickness: 2,
    },
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
      borderRadius: 2,
    },
  },
});

/** One short unit on one line: a count, a date. */
const NO_WRAP = { whiteSpace: 'nowrap' } as const;

/**
 * Each column's least width, in px: the larger of its header and its usual
 * content on one line, "Between 3 and 10 nodes", "almost 3 years ago". Free
 * text (the name) wraps rather than being cut: a pool name is what a person
 * picks the row by.
 */
const MIN_WIDTHS: Record<string, number> = {
  name: 150,
  ready: 104,
  machines: 150,
  zones: 84,
  scaling: 176,
  created: 150,
};

/** Left out first, their values named in the Machines and Node pool cells. */
const DROP_FIRST = ['zones', 'created'] as const;

function PoolButton({
  pool,
  isSelected,
  onSelect,
}: {
  pool: PlatformNodePool;
  isSelected: boolean;
  onSelect: (name: string) => void;
}) {
  const classes = useStyles();
  return (
    <button
      type="button"
      className={classes.poolButton}
      aria-pressed={isSelected}
      onClick={() => onSelect(pool.name)}
    >
      {pool.name}
    </button>
  );
}

function ReadyStatus({ pool }: { pool: PlatformNodePool }) {
  const label = formatNodesReady(pool);
  if (label === undefined) {
    return (
      <Text variant="body-medium" color="secondary">
        —
      </Text>
    );
  }
  return (
    <StatusDot
      tone={isShortOfNodes(pool) ? 'warning' : 'success'}
      label={label}
    />
  );
}

/** A value with a muted line under it, as the design's sub-lines. */
function TwoLines({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Text
        as="span"
        variant="body-medium"
        style={{ overflowWrap: 'anywhere' }}
      >
        {title}
      </Text>
      {description && (
        <Text as="span" variant="body-small" color="secondary">
          {description}
        </Text>
      )}
    </div>
  );
}

function createdText(created: string | undefined, now: Date) {
  return created ? getRelativeDate(created, now) : undefined;
}

export type PlatformNodePoolsTableProps = {
  pools: PlatformNodePool[];
  /** While the pools are read: the table's skeleton. */
  isLoading: boolean;
  selected: string | undefined;
  onSelect: (name: string) => void;
};

/**
 * The cluster's node pools, one row each: the name, a button that selects
 * the pool, with its kind; nodes ready; the machines; zones; how it scales;
 * its age. Narrower, Zones and Created leave the table, named under the
 * machines and the kind; narrower still, the rows stack.
 */
export function PlatformNodePoolsTable({
  pools,
  isLoading,
  selected,
  onSelect,
}: PlatformNodePoolsTableProps) {
  const classes = useStyles();
  const now = useMemo(() => new Date(), []);

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<PlatformNodePool>[] => {
      // The compact layout stacks the rows; its columns are the narrow ones.
      const isNarrow = tier !== 'full';
      return [
        {
          id: 'name',
          label: 'Node pool',
          isRowHeader: true,
          defaultWidth: '1.2fr',
          cell: pool => (
            <Cell>
              <TwoLines
                title={
                  <PoolButton
                    pool={pool}
                    isSelected={pool.name === selected}
                    onSelect={onSelect}
                  />
                }
                description={[
                  kindLabel(pool.kind),
                  isNarrow && pool.created
                    ? `created ${createdText(pool.created, now)}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </Cell>
          ),
        },
        {
          id: 'ready',
          label: 'Nodes ready',
          defaultWidth: '1fr',
          cell: pool => (
            <Cell>
              <ReadyStatus pool={pool} />
            </Cell>
          ),
        },
        {
          id: 'machines',
          label: 'Machines',
          defaultWidth: '1fr',
          cell: pool => (
            <Cell>
              <TwoLines
                title={pool.machine ?? '—'}
                description={[
                  pool.machineDetail,
                  isNarrow && formatZones(pool.zones)
                    ? `zones ${formatZones(pool.zones)}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </Cell>
          ),
        },
        {
          id: 'zones',
          label: 'Zones',
          defaultWidth: '0.8fr',
          cell: pool => (
            <Cell>
              <Text
                variant="body-medium"
                title={zonesTitle(pool.zones)}
                style={NO_WRAP}
              >
                {formatZones(pool.zones) ?? '—'}
              </Text>
            </Cell>
          ),
        },
        {
          id: 'scaling',
          label: 'Scaling',
          defaultWidth: '1.3fr',
          cell: pool => (
            <Cell>
              <Text variant="body-medium">{pool.scaling ?? '—'}</Text>
            </Cell>
          ),
        },
        {
          id: 'created',
          label: 'Created',
          defaultWidth: '1fr',
          cell: pool => (
            <Cell>
              <Text
                variant="body-medium"
                color="secondary"
                title={
                  pool.created ? formatLocalDateFull(pool.created) : undefined
                }
                style={NO_WRAP}
              >
                {createdText(pool.created, now) ?? '—'}
              </Text>
            </Cell>
          ),
        },
      ];
    },
    [selected, onSelect, now],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });

  return (
    <div ref={fit.ref} className={classes.table}>
      {fit.isCompact && !isLoading ? (
        <StackedRowList
          aria-label="Node pools"
          rows={pools.map(pool => ({
            id: pool.id,
            title: (
              <PoolButton
                pool={pool}
                isSelected={pool.name === selected}
                onSelect={onSelect}
              />
            ),
            status: <ReadyStatus pool={pool} />,
            facts: [
              kindLabel(pool.kind),
              [pool.machine, pool.machineDetail].filter(Boolean).join(', '),
              pool.scaling,
              formatZones(pool.zones)
                ? `zones ${formatZones(pool.zones)}`
                : undefined,
            ],
          }))}
        />
      ) : (
        <Table<PlatformNodePool>
          columnConfig={fit.columns}
          data={isLoading ? undefined : pools}
          pagination={{ type: 'none' }}
        />
      )}
    </div>
  );
}
