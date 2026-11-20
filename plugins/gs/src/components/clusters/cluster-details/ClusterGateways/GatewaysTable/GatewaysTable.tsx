import { Cell, CellText, ColumnConfig, Flex, Table, Text } from '@backstage/ui';
import {
  StackedRowList,
  useFittingColumns,
  type FittingTier,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  ConditionState,
  Gateway,
  GatewayListener,
} from '../../../../utils/gatewayTopology';
import { ConditionStatus } from '../ConditionStatus';
import {
  NamedCondition,
  conditionsDetails,
  worstCondition,
} from '../conditions';

/**
 * A name that wraps where the column is too narrow, rather than being cut:
 * a hostname is what a person reads the listener for, and a phone or a
 * keyboard cannot hover for the rest.
 */
const wrapping = { minWidth: 0, overflowWrap: 'anywhere' } as const;

/** `https · HTTPS/443 · *.example.com`: what a listener is. */
export function listenerName(listener: GatewayListener): string {
  const protocol = listener.protocol ?? '?';
  const address = listener.port ? `${protocol}/${listener.port}` : protocol;
  return [listener.name, address, listener.hostname ?? 'any'].join(' · ');
}

/** `4 routes`, undefined when the Gateway status has no entry for it. */
export function attachedRoutesLabel(
  listener: GatewayListener,
): string | undefined {
  if (listener.attachedRoutes === undefined) return undefined;
  return `${listener.attachedRoutes} ${
    listener.attachedRoutes === 1 ? 'route' : 'routes'
  }`;
}

/** One line per listener: `https · HTTPS/443 · *.example.com · 4 routes`. */
export function listenerLine(listener: GatewayListener): string {
  return [listenerName(listener), attachedRoutesLabel(listener)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A listener in a cell: the name, address and hostname wrap where they must,
 * the route count stays on one line beside them.
 */
const ListenerLine = ({ listener }: { listener: GatewayListener }) => {
  const name = listenerName(listener);
  const routes = attachedRoutesLabel(listener);
  return (
    <Flex align="start" gap="1" style={{ minWidth: 0 }}>
      <Text variant="body-medium" style={wrapping}>
        {name}
      </Text>
      {routes ? (
        <Text
          variant="body-medium"
          color="secondary"
          style={{ flex: 'none', whiteSpace: 'nowrap' }}
        >
          {` · ${routes}`}
        </Text>
      ) : null}
    </Flex>
  );
};

function conditionCell(condition: ConditionState) {
  return (
    <Cell>
      <ConditionStatus condition={condition} />
    </Cell>
  );
}

/**
 * The minimum width of each column: a header and the usual value whole
 * ("Not reported" with its icon), a listener's route count with room for
 * its name. Above them, the listeners get twice a name's share and the
 * conditions less, so a listener stays on one line where there is room.
 */
export const GATEWAY_MIN_WIDTHS: Readonly<Record<string, number>> = {
  gateway: 160,
  accepted: 140,
  programmed: 140,
  listeners: 240,
};

/**
 * Compact, only the loading table uses the columns (the rows stack): narrow
 * enough for a phone, the headers whole.
 */
const GATEWAY_COMPACT_MIN_WIDTHS: Readonly<Record<string, number>> = {
  gateway: 100,
  accepted: 100,
  programmed: 110,
};

/** The Gateways table's columns, for `useFittingColumns`. */
export function gatewayColumnsFor(tier: FittingTier): ColumnConfig<Gateway>[] {
  const columns: ColumnConfig<Gateway>[] = [
    {
      id: 'gateway',
      defaultWidth: '1fr',
      label: 'Gateway',
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.name}
          description={[row.namespace, row.className]
            .filter(Boolean)
            .join(' · ')}
        />
      ),
    },
    {
      id: 'accepted',
      defaultWidth: '0.7fr',
      label: 'Accepted',
      cell: row => conditionCell(row.accepted),
    },
    {
      id: 'programmed',
      defaultWidth: '0.7fr',
      label: 'Programmed',
      cell: row => conditionCell(row.programmed),
    },
    {
      id: 'listeners',
      defaultWidth: '2fr',
      label: 'Listeners',
      cell: row => (
        <Cell>
          {row.listeners.length ? (
            <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
              {row.listeners.map(listener => (
                <ListenerLine key={listener.name} listener={listener} />
              ))}
            </Flex>
          ) : (
            '—'
          )}
        </Cell>
      ),
    },
  ];
  // Compact, the rows stack; only the loading table uses these.
  return tier === 'compact'
    ? columns.filter(column => column.id !== 'listeners')
    : columns;
}

function gatewayConditions(gateway: Gateway): NamedCondition[] {
  return [
    { name: 'Accepted', condition: gateway.accepted },
    { name: 'Programmed', condition: gateway.programmed },
  ];
}

export type GatewaysTableProps = {
  clusterName: string;
  /** In the order to show them. */
  gateways: Gateway[];
  isLoading: boolean;
};

/**
 * A cluster's Gateways: a table while every column fits, a list of stacked
 * rows narrower, with the conditions and the listeners under each Gateway.
 */
export const GatewaysTable = ({
  clusterName,
  gateways,
  isLoading,
}: GatewaysTableProps) => {
  const fit = useFittingColumns(gatewayColumnsFor, {
    minWidths: GATEWAY_MIN_WIDTHS,
    compactMinWidths: GATEWAY_COMPACT_MIN_WIDTHS,
  });
  const emptyState = (
    <Text variant="body-medium" color="secondary">
      No Gateways found on cluster <code>{clusterName}</code>.
    </Text>
  );
  return (
    <div ref={fit.ref}>
      {fit.isCompact && !isLoading ? (
        <StackedRowList
          aria-label="Gateways"
          emptyState={emptyState}
          rows={gateways.map(gateway => {
            const conditions = gatewayConditions(gateway);
            const shown = worstCondition(conditions)!;
            return {
              id: gateway.id,
              title: gateway.name,
              status: (
                <ConditionStatus
                  condition={shown.condition}
                  name={shown.name}
                />
              ),
              facts: [
                gateway.namespace,
                gateway.className,
                `${gateway.listeners.length} ${
                  gateway.listeners.length === 1 ? 'listener' : 'listeners'
                }`,
              ],
              details: (
                <Flex direction="column" gap="1">
                  <Text variant="body-small" color="secondary">
                    {conditionsDetails(conditions)}
                  </Text>
                  {gateway.listeners.map(listener => (
                    <Text key={listener.name} variant="body-small">
                      {listenerLine(listener)}
                    </Text>
                  ))}
                </Flex>
              ),
            };
          })}
        />
      ) : (
        <Table<Gateway>
          columnConfig={fit.columns}
          data={isLoading ? undefined : gateways}
          isPending={isLoading}
          pagination={{ type: 'none' }}
          emptyState={emptyState}
        />
      )}
    </div>
  );
};
