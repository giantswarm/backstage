import { useMemo } from 'react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Alert, Flex, SearchField, Table, Text, useTable } from '@backstage/ui';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { useMimirAvailable } from '../../../hooks/useMimirAvailable';
import { useMimirGatewayTopology } from '../../../hooks/useMimirGatewayTopology';
import { useMimirGatewayPolicies } from '../../../hooks/useMimirGatewayPolicies';
import { GatewayPolicy } from '../../../utils/gatewayPolicies';
import { PoliciesTable } from './PoliciesTable';
import {
  Gateway,
  HttpRoute,
  gatewayRank,
  routeRank,
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

/** Matches a route row by route name, namespace, hostname or parent name. */
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
  const causes = new Set(
    routes.flatMap(route =>
      route.parents.flatMap(parent =>
        [parent.accepted, parent.resolvedRefs].flatMap(c =>
          c.status === 'not-available' ? [c.cause ?? 'load-failed'] : [],
        ),
      ),
    ),
  );
  if (causes.has('load-failed')) return 'load-failed';
  if (causes.has('not-exported')) return 'not-exported';
  return undefined;
}

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
  /** `false` when the installation has no Mimir; `undefined` while unknown. */
  mimirAvailable: boolean | undefined;
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
  mimirAvailable,
  policies,
  policiesLoading,
  policiesError,
}: ClusterGatewaysContentProps) => {
  const gatewayRows = useMemo(() => toGatewayRows(gateways), [gateways]);
  const routeRows = useMemo(() => toRouteRows(routes), [routes]);
  const unavailable = useMemo(() => unavailableCause(routes), [routes]);
  // No sortFn: the rows keep the problems-first order from toRouteRows.
  const { tableProps: routeTableProps, search } = useTable<RouteParentRow>({
    mode: 'complete',
    data: isLoading ? undefined : routeRows,
    searchFn: searchRouteRows,
    searchDebounceMs: 150,
    paginationOptions: { type: 'none' },
  });

  if (mimirAvailable === false) {
    return (
      <Alert
        status="info"
        icon
        title="Gateway API information is based on metrics, which are not available on this installation."
      />
    );
  }

  if (error) {
    return (
      <Alert
        status="warning"
        icon
        title="Gateway API metrics could not be loaded."
        description={error instanceof Error ? error.message : undefined}
      />
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Text variant="body-medium" color="secondary">
        Based on Gateway API metrics. Changes can take a minute or two to
        appear.
      </Text>
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
          <Alert status="info" icon title={unavailableNotice[unavailable]} />
        ) : null}
        <SearchField
          aria-label="Search HTTPRoutes"
          placeholder="Search by name, namespace, hostname or parent"
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
              {search.value ? (
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
  const mimirAvailable = useMimirAvailable(installationName);

  return (
    <ClusterGatewaysContent
      clusterName={clusterName}
      gateways={gateways}
      routes={routes}
      isLoading={isLoading}
      error={error}
      mimirAvailable={mimirAvailable}
      policies={policies}
      policiesLoading={policiesLoading}
      policiesError={policiesError}
    />
  );
};
