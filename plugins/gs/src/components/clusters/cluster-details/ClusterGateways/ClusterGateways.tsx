import { useMemo } from 'react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Alert, Flex, Table, Text } from '@backstage/ui';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { useMimirAvailable } from '../../../hooks/useMimirAvailable';
import { useMimirGatewayTopology } from '../../../hooks/useMimirGatewayTopology';
import { useMimirGatewayPolicies } from '../../../hooks/useMimirGatewayPolicies';
import { GatewayPolicy } from '../../../hooks/gatewayPolicies';
import { PoliciesTable } from './PoliciesTable';
import {
  Gateway,
  HttpRoute,
  isRouteBroken,
} from '../../../hooks/gatewayTopology';
import {
  ListenerRow,
  RouteParentRow,
  listenerColumns,
  routeColumns,
} from './columns';

function toListenerRows(gateways: Gateway[]): ListenerRow[] {
  return gateways.flatMap(gateway =>
    gateway.listeners.length
      ? gateway.listeners.map(listener => ({
          id: `${gateway.id}/${listener.name}`,
          gateway,
          listener,
        }))
      : [{ id: gateway.id, gateway }],
  );
}

function toRouteRows(routes: HttpRoute[]): RouteParentRow[] {
  // Broken routes first, so a problem is visible without scrolling.
  const ordered = [...routes].sort(
    (a, b) => Number(isRouteBroken(b)) - Number(isRouteBroken(a)),
  );
  return ordered.flatMap(route =>
    route.parents.length
      ? route.parents.map(parent => ({
          id: `${route.id}/${parent.gatewayNamespace}/${parent.gatewayName}/${parent.sectionName}`,
          route,
          parent,
        }))
      : [{ id: route.id, route }],
  );
}

/**
 * True when any route condition can't be shown. A single unreported route must
 * not hide the explanation for all the others that are not available.
 */
function conditionsUnavailable(routes: HttpRoute[]): boolean {
  return routes.some(route =>
    route.parents.some(
      parent =>
        parent.accepted.status === 'not-available' ||
        parent.resolvedRefs.status === 'not-available',
    ),
  );
}

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
  const listenerRows = useMemo(() => toListenerRows(gateways), [gateways]);
  const routeRows = useMemo(() => toRouteRows(routes), [routes]);

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
      <InfoCard title="Gateways">
        <Table<ListenerRow>
          columnConfig={listenerColumns}
          data={isLoading ? undefined : listenerRows}
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
        {!isLoading && conditionsUnavailable(routes) ? (
          <Alert
            status="info"
            icon
            title="Some route conditions are not available on this cluster."
            description="Either they could not be loaded, or the cluster runs an observability-bundle that doesn't export them yet. Routes are listed without their Accepted and ResolvedRefs status."
          />
        ) : null}
        <Table<RouteParentRow>
          columnConfig={routeColumns}
          data={isLoading ? undefined : routeRows}
          isPending={isLoading}
          pagination={{ type: 'none' }}
          emptyState={
            <Text variant="body-medium" color="secondary">
              No HTTPRoutes found on cluster <code>{clusterName}</code>.
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
