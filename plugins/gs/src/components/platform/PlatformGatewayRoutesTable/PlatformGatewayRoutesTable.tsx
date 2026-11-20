import { type ReactNode, useCallback } from 'react';
import { Cell, type ColumnConfig, Table, Text } from '@backstage/ui';
import {
  ExternalLink,
  type FittingTier,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import type { HttpRoute } from '../../utils/gatewayTopology';
import { backendLabel } from '../../clusters/cluster-details/ClusterGateways/BackendList';
import { PlatformCellLines } from '../PlatformCellLines';
import { PlatformGatewayStatus } from '../PlatformGatewayStatus';
import { PlatformMarkedText } from '../PlatformMarkedText';
import { useGatewayTableStyles } from '../utils/gatewayTableStyles';
import {
  type GatewayRouteRow,
  listenerOf,
  parentOf,
  routeMatches,
  routeStatus,
} from '../utils/gateways';

const WRAP = { overflowWrap: 'anywhere', minWidth: 0 } as const;

/**
 * Each column's least width, in px: its header and its usual content,
 * "Refs not resolved" with its dot; names wrap rather than being cut.
 */
const MIN_WIDTHS: Record<string, number> = {
  route: 170,
  hostnames: 200,
  backends: 160,
  parent: 120,
  status: 160,
};

/** Left out first, their values named under the route. */
const DROP_FIRST = ['parent', 'backends'] as const;

/** Marks the query in a row's text, only in a row the search found. */
function markerOf(query: string, isMatch: boolean) {
  return (text: string) =>
    isMatch ? <PlatformMarkedText text={text} query={query} /> : text;
}

/** One hostname per line, a concrete one linked, a wildcard not. */
function Hostnames({
  route,
  mark,
}: {
  route: HttpRoute;
  mark: (text: string) => ReactNode;
}) {
  if (route.hostnames === undefined) {
    return (
      <Text variant="body-medium" color="secondary">
        Not available
      </Text>
    );
  }
  if (route.hostnames.length === 0) {
    return <Text variant="body-medium">Any host</Text>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...WRAP }}>
      {route.hostnames.map(hostname =>
        hostname.includes('*') ? (
          <Text key={hostname} variant="body-medium" style={WRAP}>
            {mark(hostname)}
          </Text>
        ) : (
          <div key={hostname} style={WRAP}>
            <ExternalLink
              href={`https://${hostname}/`}
              variant="body-medium"
              display="inline"
            >
              <span style={WRAP}>{mark(hostname)}</span>
            </ExternalLink>
          </div>
        ),
      )}
    </div>
  );
}

/** The backends, one per line with a split's weight, or why there are none. */
function Backends({
  route,
  mark,
}: {
  route: HttpRoute;
  mark: (text: string) => ReactNode;
}) {
  const { backends } = route;
  if (backends.status !== 'available' || backends.backends.length === 0) {
    let text = 'No backends';
    if (backends.status === 'not-available') text = 'Not available';
    if (backends.status === 'not-reported') text = 'Not reported';
    return (
      <Text variant="body-medium" color="secondary">
        {text}
      </Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...WRAP }}>
      {backends.backends.map(backend => {
        const label = backendLabel(backend, route.namespace);
        return (
          <Text key={label} variant="body-medium" style={WRAP}>
            {mark(label)}
            {backend.weight ? (
              <Text as="span" variant="body-medium" color="secondary">
                {` · weight ${backend.weight}`}
              </Text>
            ) : null}
          </Text>
        );
      })}
      {backends.mayHaveMore ? (
        <Text variant="body-small" color="secondary">
          May have more backends than shown.
        </Text>
      ) : null}
    </div>
  );
}

/** The backends in one phrase, for where no column holds them. */
export function backendsText(route: HttpRoute): string {
  const { backends } = route;
  if (backends.status === 'not-available') return 'backends not available';
  if (backends.status === 'not-reported') return 'backends not reported';
  if (!backends.backends.length) return 'no backends';
  return `to ${backends.backends
    .map(backend => {
      const label = backendLabel(backend, route.namespace);
      return backend.weight ? `${label} (weight ${backend.weight})` : label;
    })
    .join(', ')}${backends.mayHaveMore ? ', maybe more' : ''}`;
}

function hostnamesText(route: HttpRoute): string {
  if (route.hostnames === undefined) return 'hostnames not available';
  return route.hostnames.length ? route.hostnames.join(', ') : 'any host';
}

export type PlatformGatewayRoutesTableProps = {
  rows: GatewayRouteRow[];
  /**
   * What the parent column shows: the listener, for a Gateway's routes; the
   * whole parent, for routes no Gateway on the cluster takes.
   */
  parentColumn: 'listener' | 'parent';
  /** The finder's query: matching rows are marked. */
  query: string;
  'aria-label': string;
  emptyState: ReactNode;
};

/**
 * HTTP routes, a row per route and parent: the route with its namespace and
 * the policies that target it; its hostnames; its backends; the listener (or
 * parent); one status. Narrower, the listener and the backends go under the
 * route; then the rows stack.
 */
export function PlatformGatewayRoutesTable({
  rows,
  parentColumn,
  query,
  'aria-label': ariaLabel,
  emptyState,
}: PlatformGatewayRoutesTableProps) {
  const classes = useGatewayTableStyles();
  const parentText = useCallback(
    (row: GatewayRouteRow) =>
      parentColumn === 'listener' && row.parent
        ? listenerOf(row.parent)
        : parentOf(row.parent),
    [parentColumn],
  );
  const chips = useCallback(
    (row: GatewayRouteRow) =>
      row.policies.length ? (
        <ul className={classes.chips} aria-label="Policies">
          {row.policies.map(policy => (
            <li key={policy.id} className={classes.chip}>
              {policy.name}
            </li>
          ))}
        </ul>
      ) : null,
    [classes.chips, classes.chip],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<GatewayRouteRow>[] => {
      const isNarrow = tier !== 'full';
      const markOf = (row: GatewayRouteRow) =>
        markerOf(query, routeMatches(row.route, query));
      return [
        {
          id: 'route',
          label: 'Route',
          isRowHeader: true,
          defaultWidth: '1.1fr',
          cell: row => {
            const mark = markOf(row);
            return (
              <Cell>
                <PlatformCellLines
                  title={mark(row.route.name)}
                  description={
                    isNarrow ? (
                      <>
                        {mark(row.route.namespace)}
                        {` · ${parentColumn === 'listener' ? 'listener ' : ''}${parentText(row)} · ${backendsText(row.route)}`}
                      </>
                    ) : (
                      mark(row.route.namespace)
                    )
                  }
                >
                  {chips(row)}
                </PlatformCellLines>
              </Cell>
            );
          },
        },
        {
          id: 'hostnames',
          label: 'Hostnames',
          defaultWidth: '1.4fr',
          cell: row => (
            <Cell>
              <Hostnames route={row.route} mark={markOf(row)} />
            </Cell>
          ),
        },
        {
          id: 'backends',
          label: 'Backends',
          defaultWidth: '0.9fr',
          cell: row => (
            <Cell>
              <Backends route={row.route} mark={markOf(row)} />
            </Cell>
          ),
        },
        {
          id: 'parent',
          label: parentColumn === 'listener' ? 'Listener' : 'Parent',
          defaultWidth: '0.9fr',
          cell: row => (
            <Cell>
              <Text variant="body-medium" style={WRAP}>
                {parentText(row)}
              </Text>
            </Cell>
          ),
        },
        {
          id: 'status',
          label: 'Status',
          defaultWidth: '1fr',
          cell: row => (
            <Cell>
              <PlatformGatewayStatus status={routeStatus(row.parent)} />
            </Cell>
          ),
        },
      ];
    },
    [query, parentColumn, parentText, chips],
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
          rows={rows.map(row => {
            const isMatch = routeMatches(row.route, query);
            return {
              id: row.id,
              title: isMatch ? (
                <PlatformMarkedText text={row.route.name} query={query} />
              ) : (
                row.route.name
              ),
              status: (
                <PlatformGatewayStatus status={routeStatus(row.parent)} />
              ),
              facts: [
                row.route.namespace,
                parentColumn === 'listener' && row.parent
                  ? `listener ${parentText(row)}`
                  : parentText(row),
                hostnamesText(row.route),
                backendsText(row.route),
              ],
              details: chips(row) ?? undefined,
            };
          })}
        />
      ) : (
        <Table<GatewayRouteRow>
          columnConfig={fit.columns}
          data={rows}
          pagination={{ type: 'none' }}
          emptyState={emptyState}
        />
      )}
    </div>
  );
}
