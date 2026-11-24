import { useMemo } from 'react';
import {
  InfoCard,
  MetricsUnavailableAlert,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import { Alert, Flex, SearchField, Table, Text, useTable } from '@backstage/ui';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { useMimirGatewayTopology } from '../../../hooks/useMimirGatewayTopology';
import { useMimirGatewayPolicies } from '../../../hooks/useMimirGatewayPolicies';
import { GatewayPolicy } from '../../../utils/gatewayPolicies';
import { useMimirGatewayReferenceGrants } from '../../../hooks/useMimirGatewayReferenceGrants';
import { ReferenceGrant } from '../../../utils/gatewayReferenceGrants';
import { PoliciesTable } from './PoliciesTable';
import { ReferenceGrantsTable } from './ReferenceGrantsTable';
import { GatewaysTable } from './GatewaysTable';
import {
  Gateway,
  HttpRoute,
  gatewayRank,
  routeRank,
  unavailableCauseOf,
} from '../../../utils/gatewayTopology';
import {
  ROUTE_COMPACT_MIN_WIDTHS,
  ROUTE_DROP_FIRST,
  ROUTE_MIN_WIDTHS,
  RouteParentRow,
  parentShortLabel,
  routeColumnsFor,
} from './columns';
import { ConditionStatus } from './ConditionStatus';
import {
  NamedCondition,
  conditionsDetails,
  worstCondition,
} from './conditions';
import { backendLabel } from './BackendList';

function toGatewayRows(gateways: Gateway[]): Gateway[] {
  // Failing Gateways first, then those without status. The sort is stable, so
  // each band keeps the name order.
  return [...gateways].sort((a, b) => gatewayRank(a) - gatewayRank(b));
}

function toRouteRows(routes: HttpRoute[]): RouteParentRow[] {
  // Broken routes first, then routes without status, so a problem is visible
  // without scrolling.
  const ordered = [...routes].sort((a, b) => routeRank(a) - routeRank(b));
  return ordered.flatMap(route =>
    route.parents.length
      ? route.parents.map(parent => ({
          id: `${route.id}/${parent.kind}/${parent.namespace}/${parent.name}/${parent.sectionName}/${parent.port ?? ''}`,
          route,
          parent,
        }))
      : [{ id: route.id, route }],
  );
}

/** The backends of a route as the column shows them, for the search. */
function backendNames(route: HttpRoute): string[] {
  return route.backends.status === 'available'
    ? route.backends.backends.map(backend =>
        backendLabel(backend, route.namespace),
      )
    : [];
}

/**
 * Matches a route row by route name, namespace, hostname, backend name or
 * parent name.
 */
export function searchRouteRows(
  rows: RouteParentRow[],
  search: string,
): RouteParentRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(({ route, parent }) =>
    [
      route.name,
      route.namespace,
      ...(route.hostnames ?? []),
      ...backendNames(route),
      parent?.name ?? '',
    ].some(value => value.toLowerCase().includes(needle)),
  );
}

/**
 * Why route conditions can't be shown, if any can't. A failed load wins over
 * an older bundle: it's the one that fixes itself on the next refetch, and
 * the bundle notice would be wrong for it. A single unreported route must not
 * hide the explanation for all the others.
 */
export function unavailableCause(
  routes: HttpRoute[],
): 'load-failed' | 'not-exported' | undefined {
  return unavailableCauseOf(
    routes.flatMap(route =>
      route.parents.flatMap(parent => [parent.accepted, parent.resolvedRefs]),
    ),
  );
}

/** Why backends can't be shown, if any can't. A failed load wins, as above. */
export function backendsUnavailableCause(
  routes: HttpRoute[],
): 'load-failed' | 'not-exported' | undefined {
  let notExported = false;
  for (const { backends } of routes) {
    if (backends.status !== 'not-available') continue;
    if (backends.cause === 'load-failed') return 'load-failed';
    notExported = true;
  }
  return notExported ? 'not-exported' : undefined;
}

export const backendsUnavailableNotice = {
  'load-failed':
    'The backends could not be loaded. They are retried automatically.',
  'not-exported': 'Backends need a newer Gateway API bundle on this cluster.',
};

/** The conditions of a route's parent, in the table's column order. */
function routeConditions(row: RouteParentRow): NamedCondition[] {
  const { parent } = row;
  if (!parent) return [];
  return [
    { name: 'Accepted', condition: parent.accepted },
    { name: 'ResolvedRefs', condition: parent.resolvedRefs },
  ];
}

/** The backends of a stacked route row, as the Backends column reads. */
function backendsFact(route: HttpRoute): string {
  const { backends } = route;
  if (backends.status === 'not-available') return 'backends not available';
  if (backends.status === 'not-reported') return 'backends not reported';
  if (!backends.backends.length) return 'no backends';
  const labels = backends.backends.map(backend => {
    const label = backendLabel(backend, route.namespace);
    return backend.weight ? `${label} (weight ${backend.weight})` : label;
  });
  return `to ${labels.join(', ')}${backends.mayHaveMore ? ', maybe more' : ''}`;
}

/** The second line of a stacked route row. */
function rowFacts(row: RouteParentRow): string[] {
  const { route, parent } = row;
  let hostnames = 'hostnames not available';
  if (route.hostnames) {
    hostnames = route.hostnames.length
      ? route.hostnames.join(', ')
      : 'any hostname';
  }
  return [
    route.namespace,
    parent ? parentShortLabel(parent) : 'No Gateway or ListenerSet parent',
    hostnames,
    backendsFact(route),
  ];
}

export const unavailableNotice = {
  'load-failed':
    'Some route conditions could not be loaded. They are retried automatically.',
  'not-exported':
    'Route conditions need observability-bundle 3.6.0 or newer on this cluster.',
};

export type ClusterGatewaysContentProps = {
  clusterName: string;
  gateways: Gateway[];
  routes: HttpRoute[];
  isLoading: boolean;
  error?: unknown;
  policies: GatewayPolicy[];
  policiesLoading: boolean;
  policiesError?: unknown;
  referenceGrants: ReferenceGrant[];
  referenceGrantsLoading: boolean;
  referenceGrantsError?: unknown;
};

/** Renders a cluster's Gateway API topology. Data loading lives in `ClusterGateways`. */
export const ClusterGatewaysContent = ({
  clusterName,
  gateways,
  routes,
  isLoading,
  error,
  policies,
  policiesLoading,
  policiesError,
  referenceGrants,
  referenceGrantsLoading,
  referenceGrantsError,
}: ClusterGatewaysContentProps) => {
  const gatewayRows = useMemo(() => toGatewayRows(gateways), [gateways]);
  const routeRows = useMemo(() => toRouteRows(routes), [routes]);
  const unavailable = useMemo(() => unavailableCause(routes), [routes]);
  const backendsUnavailable = useMemo(
    () => backendsUnavailableCause(routes),
    [routes],
  );
  // No sortFn: the rows keep the problems-first order from toRouteRows.
  const fit = useFittingColumns(routeColumnsFor, {
    minWidths: ROUTE_MIN_WIDTHS,
    dropFirst: ROUTE_DROP_FIRST,
    compactMinWidths: ROUTE_COMPACT_MIN_WIDTHS,
  });
  const { tableProps: routeTableProps, search } = useTable<RouteParentRow>({
    mode: 'complete',
    data: isLoading ? undefined : routeRows,
    searchFn: searchRouteRows,
    searchDebounceMs: 150,
    paginationOptions: { type: 'none' },
  });

  const routesEmptyState = (
    <Text variant="body-medium" color="secondary">
      {/* Not search.value: the rows filter on the debounced value. */}
      {routeRows.length ? (
        'No HTTPRoutes match the search.'
      ) : (
        <>
          No HTTPRoutes found on cluster <code>{clusterName}</code>.
        </>
      )}
    </Text>
  );

  return (
    <Flex direction="column" gap="4">
      <Text variant="body-medium" color="secondary">
        Based on Gateway API metrics. Changes can take a minute or two to
        appear.
      </Text>
      {/* The policies and ReferenceGrants load on their own, so a topology
          error leaves them shown. */}
      {error ? (
        <MetricsUnavailableAlert
          error={error}
          title="Gateway API metrics could not be loaded."
          description={error instanceof Error ? error.message : undefined}
        />
      ) : (
        <>
          <InfoCard title="Gateways">
            <GatewaysTable
              clusterName={clusterName}
              gateways={gatewayRows}
              isLoading={isLoading}
            />
          </InfoCard>
          <InfoCard title="HTTPRoutes">
            {!isLoading && unavailable ? (
              <Alert
                status="info"
                icon
                title={unavailableNotice[unavailable]}
              />
            ) : null}
            {!isLoading && backendsUnavailable ? (
              <Alert
                status="info"
                icon
                title={backendsUnavailableNotice[backendsUnavailable]}
              />
            ) : null}
            <SearchField
              aria-label="Search HTTPRoutes"
              placeholder="Search by name, namespace, hostname, backend or parent"
              value={search.value}
              onChange={search.onChange}
              style={{ maxWidth: 420 }}
            />
            <div ref={fit.ref}>
              {fit.isCompact && !isLoading ? (
                <StackedRowList
                  aria-label="HTTPRoutes"
                  rows={(routeTableProps.data ?? []).map(row => {
                    const conditions = routeConditions(row);
                    const shown = worstCondition(conditions);
                    return {
                      id: row.id,
                      title: row.route.name,
                      status: shown ? (
                        <ConditionStatus
                          condition={shown.condition}
                          name={shown.name}
                        />
                      ) : undefined,
                      facts: rowFacts(row),
                      details: conditions.length
                        ? conditionsDetails(conditions)
                        : undefined,
                    };
                  })}
                  emptyState={routesEmptyState}
                />
              ) : (
                <Table<RouteParentRow>
                  {...routeTableProps}
                  columnConfig={fit.columns}
                  isPending={isLoading}
                  emptyState={routesEmptyState}
                />
              )}
            </div>
          </InfoCard>
        </>
      )}
      <InfoCard title="ReferenceGrants">
        <ReferenceGrantsTable
          clusterName={clusterName}
          referenceGrants={referenceGrants}
          isLoading={referenceGrantsLoading}
          error={referenceGrantsError}
        />
      </InfoCard>
      <InfoCard title="Envoy Gateway policies">
        <PoliciesTable
          clusterName={clusterName}
          policies={policies}
          isLoading={policiesLoading}
          error={policiesError}
        />
      </InfoCard>
    </Flex>
  );
};

export const ClusterGateways = () => {
  const { installationName, cluster } = useCurrentCluster();
  const clusterName = cluster.getName();

  const { gateways, routes, isLoading, error } = useMimirGatewayTopology({
    installationName,
    clusterName,
    refetchInterval: 30_000,
  });
  const {
    policies,
    isLoading: policiesLoading,
    error: policiesError,
  } = useMimirGatewayPolicies({
    installationName,
    clusterName,
    refetchInterval: 30_000,
  });
  const {
    referenceGrants,
    isLoading: referenceGrantsLoading,
    error: referenceGrantsError,
  } = useMimirGatewayReferenceGrants({
    installationName,
    clusterName,
    refetchInterval: 30_000,
  });

  return (
    <ClusterGatewaysContent
      clusterName={clusterName}
      gateways={gateways}
      routes={routes}
      isLoading={isLoading}
      error={error}
      policies={policies}
      policiesLoading={policiesLoading}
      policiesError={policiesError}
      referenceGrants={referenceGrants}
      referenceGrantsLoading={referenceGrantsLoading}
      referenceGrantsError={referenceGrantsError}
    />
  );
};
