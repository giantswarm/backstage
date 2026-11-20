import { useCallback, useMemo } from 'react';
import { Cell, type ColumnConfig, Table, Text } from '@backstage/ui';
import {
  type FittingTier,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import type { GatewayListener } from '../../utils/gatewayTopology';
import { PlatformCellLines } from '../PlatformCellLines';
import { useGatewayTableStyles } from '../utils/gatewayTableStyles';
import { protocolOf } from '../utils/gateways';

type ListenerRow = GatewayListener & { id: string };

/**
 * Each column's least width, in px: its header and its usual content,
 * "HTTPS / 443", a wildcard hostname, which wraps where it must.
 */
const MIN_WIDTHS: Record<string, number> = {
  listener: 140,
  protocol: 110,
  hostname: 200,
  routes: 80,
};

/** Left out first, its value named under the listener. */
const DROP_FIRST = ['protocol'] as const;

/** `—` where the Gateway status has no entry for the listener. */
function routesOf(listener: GatewayListener): string {
  return listener.attachedRoutes === undefined
    ? '—'
    : String(listener.attachedRoutes);
}

/**
 * The listeners of one Gateway: name, protocol and port, the hostname they
 * answer (any, without one), and how many routes the Gateway reports
 * attached. Narrower, the protocol goes under the name; then the rows stack.
 */
export function PlatformGatewayListenersTable({
  listeners,
}: {
  listeners: GatewayListener[];
}) {
  const classes = useGatewayTableStyles();
  const rows = useMemo(
    () => listeners.map(listener => ({ ...listener, id: listener.name })),
    [listeners],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<ListenerRow>[] => [
      {
        id: 'listener',
        label: 'Listener',
        isRowHeader: true,
        defaultWidth: '1fr',
        cell: row => (
          <Cell>
            <PlatformCellLines
              title={row.name}
              description={tier === 'full' ? undefined : protocolOf(row)}
            />
          </Cell>
        ),
      },
      {
        id: 'protocol',
        label: 'Protocol',
        defaultWidth: '0.8fr',
        cell: row => (
          <Cell>
            <Text variant="body-medium" style={{ whiteSpace: 'nowrap' }}>
              {protocolOf(row)}
            </Text>
          </Cell>
        ),
      },
      {
        id: 'hostname',
        label: 'Hostname',
        defaultWidth: '1.4fr',
        cell: row => (
          <Cell>
            {row.hostname ? (
              <span className={classes.mono}>{row.hostname}</span>
            ) : (
              <Text variant="body-medium">Any</Text>
            )}
          </Cell>
        ),
      },
      {
        id: 'routes',
        label: 'Routes',
        defaultWidth: '0.5fr',
        cell: row => (
          <Cell>
            <Text variant="body-medium">{routesOf(row)}</Text>
          </Cell>
        ),
      },
    ],
    [classes.mono],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });
  const emptyState = (
    <Text variant="body-medium" color="secondary">
      This Gateway has no listeners.
    </Text>
  );

  return (
    <div ref={fit.ref} className={classes.table}>
      {fit.isCompact ? (
        <StackedRowList
          aria-label="Listeners"
          emptyState={emptyState}
          rows={rows.map(row => ({
            id: row.id,
            title: row.name,
            facts: [
              protocolOf(row),
              row.hostname ?? 'any hostname',
              row.attachedRoutes === undefined
                ? undefined
                : `${row.attachedRoutes} ${row.attachedRoutes === 1 ? 'route' : 'routes'}`,
            ],
          }))}
        />
      ) : (
        <Table<ListenerRow>
          columnConfig={fit.columns}
          data={rows}
          pagination={{ type: 'none' }}
          emptyState={emptyState}
        />
      )}
    </div>
  );
}
