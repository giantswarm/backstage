import { useMemo } from 'react';
import {
  InfoCard,
  MetricsUnavailableAlert,
} from '@giantswarm/backstage-plugin-ui-react';
import { Alert, Flex, SearchField, Table, Text, useTable } from '@backstage/ui';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { useMimirGatewayTopology } from '../../../hooks/useMimirGatewayTopology';
import { useMimirGatewayPolicies } from '../../../hooks/useMimirGatewayPolicies';
import { GatewayPolicy } from '../../../utils/gatewayPolicies';
import { PoliciesTable } from './PoliciesTable';
import {
  Gateway,
  HttpRoute,
  gatewayRank,
  routeRank,
  unavailableCauseOf,
} from '../../../utils/gatewayTopology';
import {
  GatewayRow,
  RouteParentRow,
  gatewayColumns,
  routeColumns,
} from './columns';

function toGatewayRows(gateways: Gateway[]): GatewayRow[] {
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

/** The backend names of a route, for the search. */
function backendNames(route: HttpRoute): string[] {
  return route.backends.status === 'available'
    ? route.backends.backends.map(backend => backend.name)
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
function unavailableCause(
  routes: HttpRoute[],
): 'load-failed' | 'not-exported' | undefined {
  return unavailableCauseOf(
    routes.flatMap(route =>
      route.parents.flatMap(parent => [parent.accepted, parent.resolvedRefs]),
    ),
  );
}

/** Why backends can't be shown, if any can't. A failed load wins, as above. */
function backendsUnavailableCause(
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

const backendsUnavailableNotice = {
  'load-failed':
    'The backends could not be loaded. They are retried automatically.',
  'not-exported': 'Backends need a newer Gateway API bundle on this cluster.',
};

const unavailableNotice = {
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
}: ClusterGatewaysContentProps) => {
  const gatewayRows = useMemo(() => toGatewayRows(gateways), [gateways]);
  const routeRows = useMemo(() => toRouteRows(routes), [routes]);
  const unavailable = useMemo(() => unavailableCause(routes), [routes]);
  const backendsUnavailable = useMemo(
    () => backendsUnavailableCause(routes),
    [routes],
  );
  // No sortFn: the rows keep the problems-first order from toRouteRows.
  const { tableProps: routeTableProps, search } = useTable<RouteParentRow>({
    mode: 'complete',
    data: isLoading ? undefined : routeRows,
    searchFn: searchRouteRows,
    searchDebounceMs: 150,
    paginationOptions: { type: 'none' },
  });

  return (
    <Flex direction="column" gap="4">
      <Text variant="body-medium" color="secondary">
        Based on Gateway API metrics. Changes can take a minute or two to
        appear.
      </Text>
      {/* The policies load on their own, so a topology error leaves them shown. */}
      {error ? (
        <MetricsUnavailableAlert
          error={error}
          title="Gateway API metrics could not be loaded."
          description={error instanceof Error ? error.message : undefined}
        />
      ) : (
        <>
          <InfoCard title="Gateways">
            <Table<GatewayRow>
              columnConfig={gatewayColumns}
              data={isLoading ? undefined : gatewayRows}
              isPending={isLoading}
              pagination={{ type: 'none' }}
              emptyState={
                <Text variant="body-medium" color="secondary">
                  No Gateways found on cluster <code>{clusterName}</code>.
                </Text>
              }
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
            <Table<RouteParentRow>
              {...routeTableProps}
              columnConfig={routeColumns}
              isPending={isLoading}
              emptyState={
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
              }
            />
          </InfoCard>
        </>
      )}
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
    />
  );
};
