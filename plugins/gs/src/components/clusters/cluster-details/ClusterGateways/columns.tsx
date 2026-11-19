import { Cell, CellText, ColumnConfig, Flex, Text } from '@backstage/ui';
import type { FittingTier } from '@giantswarm/backstage-plugin-ui-react';
import {
  ConditionState,
  Gateway,
  GatewayListener,
  HttpRoute,
  HttpRouteParent,
} from '../../../utils/gatewayTopology';
import { ConditionStatus } from './ConditionStatus';
import { HostnameList } from './HostnameList';
import { BackendList } from './BackendList';

export type GatewayRow = Gateway;

export type RouteParentRow = {
  id: string;
  route: HttpRoute;
  parent?: HttpRouteParent;
};

function conditionCell(condition: ConditionState | undefined) {
  return (
    <Cell>{condition ? <ConditionStatus condition={condition} /> : '—'}</Cell>
  );
}

/** One line per listener: `https · HTTPS/443 · *.example.com · 4 routes`. */
function listenerLine(listener: GatewayListener): string {
  const protocol = listener.protocol ?? '?';
  const address = listener.port ? `${protocol}/${listener.port}` : protocol;
  const routes =
    listener.attachedRoutes === undefined
      ? undefined
      : `${listener.attachedRoutes} ${
          listener.attachedRoutes === 1 ? 'route' : 'routes'
        }`;
  return [listener.name, address, listener.hostname ?? 'any', routes]
    .filter(Boolean)
    .join(' · ');
}

export const gatewayColumns: ColumnConfig<GatewayRow>[] = [
  {
    id: 'gateway',
    label: 'Gateway',
    isRowHeader: true,
    cell: row => (
      <CellText
        title={row.name}
        description={[row.namespace, row.className].filter(Boolean).join(' · ')}
      />
    ),
  },
  {
    id: 'accepted',
    label: 'Accepted',
    cell: row => conditionCell(row.accepted),
  },
  {
    id: 'programmed',
    label: 'Programmed',
    cell: row => conditionCell(row.programmed),
  },
  {
    id: 'listeners',
    label: 'Listeners',
    cell: row => (
      <Cell>
        {row.listeners.length ? (
          <Flex direction="column" gap="1">
            {row.listeners.map(listener => (
              <Text key={listener.name} variant="body-medium">
                {listenerLine(listener)}
              </Text>
            ))}
          </Flex>
        ) : (
          '—'
        )}
      </Cell>
    ),
  },
];

/** `giantswarm-default · Gateway · envoy-gateway-system · https`, for a parent. */
export function parentLabel(parent: HttpRouteParent): string {
  return [
    parent.name,
    parent.kind,
    parent.namespace,
    parent.sectionName || (parent.port ? undefined : 'all listeners'),
    parent.port ? `port ${parent.port}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The minimum width of each column: a header and the usual value whole
 * ("Not reported" with its icon), the names as wide as the column allows.
 */
export const ROUTE_MIN_WIDTHS: Readonly<Record<string, number>> = {
  route: 160,
  hostnames: 180,
  backends: 180,
  parent: 160,
  accepted: 140,
  resolvedRefs: 140,
};

/**
 * A parent in one phrase, for where no column holds it:
 * `Gateway envoy-gateway-system/giantswarm-default, listener https`; a parent
 * that names no listener, `all listeners`, or `port 443` when it names a port.
 */
export function parentShortLabel(parent: HttpRouteParent): string {
  const listeners = [
    parent.sectionName ? `listener ${parent.sectionName}` : undefined,
    parent.port ? `port ${parent.port}` : undefined,
  ].filter(Boolean);
  return `${parent.kind} ${parent.namespace}/${parent.name}, ${
    listeners.length ? listeners.join(', ') : 'all listeners'
  }`;
}

const NO_PARENT = 'No Gateway or ListenerSet parent';

/** Narrower, the parent leaves the table for the route's description. */
export const ROUTE_DROP_FIRST: readonly string[] = ['parent'];

/**
 * Compact, only the loading table uses the columns (the rows stack): narrow
 * enough for a phone, so the skeleton does not scroll sideways.
 */
export const ROUTE_COMPACT_MIN_WIDTHS: Readonly<Record<string, number>> = {
  route: 120,
  accepted: 100,
  resolvedRefs: 100,
};

/** The HTTPRoutes table's columns, for `useFittingColumns`. */
export function routeColumnsFor(
  tier: FittingTier,
): ColumnConfig<RouteParentRow>[] {
  const parentInRoute = tier !== 'full';
  const route: ColumnConfig<RouteParentRow> = {
    id: 'route',
    label: 'HTTPRoute',
    isRowHeader: true,
    cell: row => (
      <CellText
        title={row.route.name}
        description={
          parentInRoute
            ? `${row.route.namespace} · ${
                row.parent ? parentShortLabel(row.parent) : NO_PARENT
              }`
            : row.route.namespace
        }
      />
    ),
  };
  const conditions: ColumnConfig<RouteParentRow>[] = [
    {
      id: 'accepted',
      label: 'Accepted',
      cell: row => conditionCell(row.parent?.accepted),
    },
    {
      id: 'resolvedRefs',
      label: 'ResolvedRefs',
      cell: row => conditionCell(row.parent?.resolvedRefs),
    },
  ];
  // Compact, the rows stack; only the loading table uses these, so it does
  // not show six columns squeezed into a phone.
  if (tier === 'compact') return [route, ...conditions];
  return [
    route,
    {
      id: 'hostnames',
      label: 'Hostnames',
      cell: row => (
        <Cell>
          <HostnameList hostnames={row.route.hostnames} />
        </Cell>
      ),
    },
    {
      id: 'backends',
      label: 'Backends',
      cell: row => (
        <Cell>
          <BackendList
            backends={row.route.backends}
            routeNamespace={row.route.namespace}
          />
        </Cell>
      ),
    },
    {
      id: 'parent',
      label: 'Parent / listener',
      cell: row =>
        row.parent ? (
          <CellText
            title={row.parent.name}
            description={parentLabel(row.parent)
              .split(' · ')
              .slice(1)
              .join(' · ')}
          />
        ) : (
          <CellText title={NO_PARENT} />
        ),
    },
    ...conditions,
  ];
}
