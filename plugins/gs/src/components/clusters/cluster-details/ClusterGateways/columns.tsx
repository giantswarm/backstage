import { Cell, CellText, ColumnConfig, Flex, Link, Text } from '@backstage/ui';
import {
  ConditionState,
  Gateway,
  GatewayListener,
  HttpRoute,
  HttpRouteParent,
} from '../../../utils/gatewayTopology';
import { ConditionStatus } from './ConditionStatus';

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

/** A wildcard has no single address to open, so only concrete names link. */
function HostnameList({ hostnames }: { hostnames: string[] | undefined }) {
  if (hostnames === undefined) return <>—</>;
  if (hostnames.length === 0) return <>any</>;
  return (
    <Flex direction="column" gap="1">
      {hostnames.map(hostname =>
        hostname.includes('*') ? (
          <Text key={hostname} variant="body-medium">
            {hostname}
          </Text>
        ) : (
          <Link
            key={hostname}
            href={`https://${hostname}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {hostname}
          </Link>
        ),
      )}
    </Flex>
  );
}

export const routeColumns: ColumnConfig<RouteParentRow>[] = [
  {
    id: 'route',
    label: 'HTTPRoute',
    isRowHeader: true,
    cell: row => (
      <CellText title={row.route.name} description={row.route.namespace} />
    ),
  },
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
    id: 'parent',
    label: 'Parent / listener',
    cell: row =>
      row.parent ? (
        <CellText
          title={row.parent.name}
          description={[
            row.parent.kind,
            row.parent.namespace,
            row.parent.sectionName || 'all listeners',
            row.parent.port ? `port ${row.parent.port}` : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : (
        <CellText title="No Gateway or ListenerSet parent" />
      ),
  },
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
