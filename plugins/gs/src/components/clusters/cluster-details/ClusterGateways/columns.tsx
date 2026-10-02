import { Cell, CellText, ColumnConfig } from '@backstage/ui';
import {
  ConditionState,
  Gateway,
  GatewayListener,
  HttpRoute,
  HttpRouteParent,
} from '../../../hooks/gatewayTopology';
import { ConditionStatus } from './ConditionStatus';

export type ListenerRow = {
  id: string;
  gateway: Gateway;
  listener?: GatewayListener;
};

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

function listenerAddress(listener: GatewayListener | undefined): string {
  if (!listener) return '—';
  const protocol = listener.protocol ?? '?';
  return listener.port ? `${protocol}/${listener.port}` : protocol;
}

export const listenerColumns: ColumnConfig<ListenerRow>[] = [
  {
    id: 'gateway',
    label: 'Gateway',
    isRowHeader: true,
    cell: row => (
      <CellText title={row.gateway.name} description={row.gateway.namespace} />
    ),
  },
  {
    id: 'class',
    label: 'Class',
    cell: row => <CellText title={row.gateway.className ?? '—'} />,
  },
  {
    id: 'accepted',
    label: 'Accepted',
    cell: row => conditionCell(row.gateway.accepted),
  },
  {
    id: 'programmed',
    label: 'Programmed',
    cell: row => conditionCell(row.gateway.programmed),
  },
  {
    id: 'listener',
    label: 'Listener',
    cell: row => (
      <CellText
        title={row.listener?.name ?? '—'}
        description={listenerAddress(row.listener)}
      />
    ),
  },
  {
    id: 'hostname',
    label: 'Hostname',
    cell: row => <CellText title={row.listener?.hostname ?? 'any'} />,
  },
  {
    id: 'attachedRoutes',
    label: 'Attached routes',
    cell: row => (
      <CellText title={String(row.listener?.attachedRoutes ?? '—')} />
    ),
  },
];

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
      <CellText
        title={
          row.route.hostnames === undefined
            ? '—'
            : row.route.hostnames.join(', ') || 'any'
        }
      />
    ),
  },
  {
    id: 'parent',
    label: 'Gateway / listener',
    cell: row =>
      row.parent ? (
        <CellText
          title={row.parent.gatewayName}
          description={`${row.parent.gatewayNamespace} · ${
            row.parent.sectionName || 'all listeners'
          }`}
        />
      ) : (
        <CellText title="No Gateway parent" />
      ),
  },
  {
    id: 'accepted',
    label: 'Accepted',
    cell: row => conditionCell(row.parent?.accepted),
  },
  {
    id: 'resolvedRefs',
    label: 'Resolved refs',
    cell: row => conditionCell(row.parent?.resolvedRefs),
  },
];
