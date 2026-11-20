import { type ReactNode, useCallback } from 'react';
import { Cell, type ColumnConfig, Table, Text } from '@backstage/ui';
import {
  type FittingTier,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import { PlatformCellLines } from '../PlatformCellLines';
import { PlatformGatewayStatus } from '../PlatformGatewayStatus';
import { PlatformMarkedText } from '../PlatformMarkedText';
import { useGatewayTableStyles } from '../utils/gatewayTableStyles';
import {
  type GatewayMatch,
  type GatewayView,
  gatewayStatus,
} from '../utils/gateways';

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Each column's least width, in px: its header and its usual content on one
 * line, "Not programmed" with its dot, "2 failing". The name wraps.
 */
const MIN_WIDTHS: Record<string, number> = {
  gateway: 200,
  status: 150,
  listeners: 96,
  routes: 110,
  policies: 90,
};

/** Left out first, their counts named under the Gateway's name. */
const DROP_FIRST = ['policies', 'listeners'] as const;

/** The finder's line under a Gateway: `Hostname: x (route y)`. */
function MatchLine({ match, query }: { match: GatewayMatch; query: string }) {
  return (
    <Text as="span" variant="body-small" style={{ overflowWrap: 'anywhere' }}>
      {match.kind}: <PlatformMarkedText text={match.value} query={query} />
      {match.route ? ` (route ${match.route})` : null}
    </Text>
  );
}

function RoutesCount({ view }: { view: GatewayView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Text as="span" variant="body-medium">
        {view.routes.length}
      </Text>
      {view.failingRoutes > 0 ? (
        <Text as="span" variant="body-small" color="danger">
          {view.failingRoutes} failing
        </Text>
      ) : null}
    </div>
  );
}

export type PlatformGatewaysTableProps = {
  /** The Gateways to list, in order: the finder's matches while it searches. */
  gateways: GatewayView[];
  isLoading: boolean;
  selected: string | undefined;
  onSelect: (key: string) => void;
  /** What the finder found on each Gateway, by key. */
  matches: ReadonlyMap<string, GatewayMatch>;
  query: string;
  emptyState: ReactNode;
};

/**
 * A cluster's Gateways, one row each: the name, a button that selects the
 * Gateway, with its namespace; one status; how many listeners, routes and
 * policies it has. Narrower, Policies and Listeners leave the table, named
 * under the namespace; narrower still, the rows stack.
 */
export function PlatformGatewaysTable({
  gateways,
  isLoading,
  selected,
  onSelect,
  matches,
  query,
  emptyState,
}: PlatformGatewaysTableProps) {
  const classes = useGatewayTableStyles();

  const selectButton = useCallback(
    (view: GatewayView) => (
      <button
        type="button"
        className={classes.select}
        aria-pressed={view.key === selected}
        onClick={() => onSelect(view.key)}
      >
        {view.gateway.name}
      </button>
    ),
    [classes.select, selected, onSelect],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<GatewayView>[] => {
      const isNarrow = tier !== 'full';
      return [
        {
          id: 'gateway',
          label: 'Gateway',
          isRowHeader: true,
          defaultWidth: '1.4fr',
          cell: view => {
            const match = matches.get(view.key);
            return (
              <Cell>
                <PlatformCellLines
                  title={selectButton(view)}
                  description={[
                    view.gateway.namespace,
                    isNarrow
                      ? count(
                          view.gateway.listeners.length,
                          'listener',
                          'listeners',
                        )
                      : undefined,
                    isNarrow
                      ? count(view.policies.length, 'policy', 'policies')
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {match ? <MatchLine match={match} query={query} /> : null}
                </PlatformCellLines>
              </Cell>
            );
          },
        },
        {
          id: 'status',
          label: 'Status',
          defaultWidth: '1fr',
          cell: view => (
            <Cell>
              <PlatformGatewayStatus status={gatewayStatus(view.gateway)} />
            </Cell>
          ),
        },
        {
          id: 'listeners',
          label: 'Listeners',
          defaultWidth: '0.7fr',
          cell: view => (
            <Cell>
              <Text variant="body-medium">{view.gateway.listeners.length}</Text>
            </Cell>
          ),
        },
        {
          id: 'routes',
          label: 'Routes',
          defaultWidth: '0.8fr',
          cell: view => (
            <Cell>
              <RoutesCount view={view} />
            </Cell>
          ),
        },
        {
          id: 'policies',
          label: 'Policies',
          defaultWidth: '0.6fr',
          cell: view => (
            <Cell>
              <Text variant="body-medium">{view.policies.length}</Text>
            </Cell>
          ),
        },
      ];
    },
    [matches, query, selectButton],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });

  return (
    <div ref={fit.ref} className={classes.table}>
      {fit.isCompact && !isLoading ? (
        <StackedRowList
          aria-label="Gateways"
          emptyState={emptyState}
          rows={gateways.map(view => {
            const match = matches.get(view.key);
            return {
              id: view.key,
              title: selectButton(view),
              status: (
                <PlatformGatewayStatus status={gatewayStatus(view.gateway)} />
              ),
              facts: [
                view.gateway.namespace,
                count(view.gateway.listeners.length, 'listener', 'listeners'),
                count(view.routes.length, 'route', 'routes') +
                  (view.failingRoutes ? `, ${view.failingRoutes} failing` : ''),
                count(view.policies.length, 'policy', 'policies'),
              ],
              details: match ? (
                <MatchLine match={match} query={query} />
              ) : undefined,
            };
          })}
        />
      ) : (
        <Table<GatewayView>
          columnConfig={fit.columns}
          data={isLoading ? undefined : gateways}
          isPending={isLoading}
          pagination={{ type: 'none' }}
          emptyState={emptyState}
        />
      )}
    </div>
  );
}
