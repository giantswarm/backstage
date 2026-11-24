import { type ReactNode, useCallback } from 'react';
import { Cell, type ColumnConfig, Table, Text } from '@backstage/ui';
import {
  type FittingTier,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  type ReferenceGrantEntry,
  referenceGrantFromEntry,
  referenceGrantToEntry,
} from '../../utils/gatewayReferenceGrants';
import { PlatformCellLines } from '../PlatformCellLines';
import { PlatformMarkedText } from '../PlatformMarkedText';
import { useGatewayTableStyles } from '../hooks';
import {
  type GatewayReferenceGrantRow,
  referenceGrantMatches,
} from '../utils/gateways';

/**
 * Each column's least width, in px: its header and its usual entry,
 * "HTTPRoute in monitoring", "Service alloy-logexporter".
 */
const MIN_WIDTHS: Record<string, number> = {
  grant: 170,
  from: 170,
  to: 170,
  usedBy: 170,
};

/** Left out first, its entries named under the grant. */
const DROP_FIRST = ['from'] as const;

/** One entry per line, each wrapping on its own. */
function Entries({ entries }: { entries: ReferenceGrantEntry[] }) {
  if (!entries.length) {
    return (
      <Text variant="body-medium" color="secondary">
        Not reported
      </Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {entries.map(entry => (
        <Text
          key={entry.key}
          variant="body-medium"
          style={{ overflowWrap: 'anywhere' }}
        >
          {entry.label}
        </Text>
      ))}
    </div>
  );
}

const NOT_USED = 'No route found';

function UsedBy({ row }: { row: GatewayReferenceGrantRow }) {
  if (!row.routes.length && !row.forGateway) {
    return (
      <Text variant="body-medium" color="secondary">
        {NOT_USED}
      </Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {row.routes.map(route => (
        <PlatformCellLines
          key={route.id}
          title={route.name}
          description={`HTTP route in ${route.namespace}`}
        />
      ))}
      {row.forGateway ? (
        <PlatformCellLines
          title="Gateways"
          description={`in ${row.grant.from
            .filter(from => from.kind === 'Gateway')
            .map(from => from.namespace)
            .join(', ')}`}
        />
      ) : null}
    </div>
  );
}

function list(entries: ReferenceGrantEntry[]): string {
  return entries.length
    ? entries.map(entry => entry.label).join(', ')
    : 'not reported';
}

function usedByText(row: GatewayReferenceGrantRow): string {
  const users = [
    ...row.routes.map(route => `${route.name} (HTTP route)`),
    ...(row.forGateway ? ['Gateways'] : []),
  ];
  return users.length ? `used by ${users.join(', ')}` : NOT_USED.toLowerCase();
}

export type PlatformGatewayReferenceGrantsTableProps = {
  rows: GatewayReferenceGrantRow[];
  query: string;
  'aria-label': string;
  emptyState: ReactNode;
};

/**
 * ReferenceGrants: the grant with its namespace, what may reference into
 * that namespace (From), what it may reference there (To), and the routes
 * or Gateways the grant lets do so. Narrower, From goes under the grant;
 * then the rows stack.
 */
export function PlatformGatewayReferenceGrantsTable({
  rows,
  query,
  'aria-label': ariaLabel,
  emptyState,
}: PlatformGatewayReferenceGrantsTableProps) {
  const classes = useGatewayTableStyles();
  const name = useCallback(
    (row: GatewayReferenceGrantRow) =>
      referenceGrantMatches(row.grant, query) ? (
        <PlatformMarkedText text={row.grant.name} query={query} />
      ) : (
        row.grant.name
      ),
    [query],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<GatewayReferenceGrantRow>[] => [
      {
        id: 'grant',
        label: 'ReferenceGrant',
        isRowHeader: true,
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <PlatformCellLines
              title={name(row)}
              description={
                tier === 'full'
                  ? row.grant.namespace
                  : `${row.grant.namespace} · from ${list(
                      row.grant.from.map(referenceGrantFromEntry),
                    )}`
              }
            />
          </Cell>
        ),
      },
      {
        id: 'from',
        label: 'From',
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <Entries entries={row.grant.from.map(referenceGrantFromEntry)} />
          </Cell>
        ),
      },
      {
        id: 'to',
        label: 'To',
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <Entries entries={row.grant.to.map(referenceGrantToEntry)} />
          </Cell>
        ),
      },
      {
        id: 'usedBy',
        label: 'Used by',
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <UsedBy row={row} />
          </Cell>
        ),
      },
    ],
    [name],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });

  return (
    <div ref={fit.ref} className={`${classes.table} ${classes.marksRows}`}>
      {fit.isCompact ? (
        <StackedRowList
          aria-label={ariaLabel}
          emptyState={emptyState}
          rows={rows.map(row => ({
            id: row.id,
            title: name(row),
            facts: [
              row.grant.namespace,
              `from ${list(row.grant.from.map(referenceGrantFromEntry))}`,
              `to ${list(row.grant.to.map(referenceGrantToEntry))}`,
              usedByText(row),
            ],
          }))}
        />
      ) : (
        <Table<GatewayReferenceGrantRow>
          columnConfig={fit.columns}
          data={rows}
          pagination={{ type: 'none' }}
          emptyState={emptyState}
        />
      )}
    </div>
  );
}
