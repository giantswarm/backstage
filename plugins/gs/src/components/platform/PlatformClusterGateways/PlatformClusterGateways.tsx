import { type ReactNode, useCallback, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Flex, SearchField, Text } from '@backstage/ui';
import { MetricsUnavailableAlert } from '@giantswarm/backstage-plugin-ui-react';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import {
  backendsUnavailableCause,
  backendsUnavailableNotice,
  unavailableCause,
  unavailableNotice,
} from '../../clusters/cluster-details/ClusterGateways/ClusterGateways';
import {
  policiesUnavailableCause,
  policiesUnavailableNotice,
} from '../../clusters/cluster-details/ClusterGateways/PoliciesTable';
import { useMimirGatewayPolicies } from '../../hooks/useMimirGatewayPolicies';
import { useMimirGatewayTopology } from '../../hooks/useMimirGatewayTopology';
import type { GatewayPolicy } from '../../utils/gatewayPolicies';
import type { Gateway, HttpRoute } from '../../utils/gatewayTopology';
import { PlatformGatewayListenersTable } from '../PlatformGatewayListenersTable';
import { PlatformGatewayPoliciesTable } from '../PlatformGatewayPoliciesTable';
import { PlatformGatewayRoutesTable } from '../PlatformGatewayRoutesTable';
import { PlatformGatewaysTable } from '../PlatformGatewaysTable';
import { useGatewayTableStyles } from '../utils/gatewayTableStyles';
import {
  type GatewayMatch,
  type GatewayPolicyRow,
  type GatewayView,
  buildGatewayViews,
  matchGateway,
  normalizeQuery,
  policyMatches,
  routeMatches,
} from '../utils/gateways';

/** `?gateway=<namespace>/<name>`: the Gateway shown below the table. */
const GATEWAY_PARAM = 'gateway';

/**
 * The selected Gateway in the address, so a reload or a shared link shows
 * the same one. Replaced, not pushed: a selection is no page to go back to.
 */
export function useSelectedGateway(): [
  string | undefined,
  (key: string) => void,
] {
  const [params, setParams] = useSearchParams();
  const select = useCallback(
    (key: string) =>
      setParams(
        next => {
          next.set(GATEWAY_PARAM, key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [params.get(GATEWAY_PARAM) ?? undefined, select];
}

/** A heading inside a section, with the count of what it lists. */
function SubSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const classes = useGatewayTableStyles();
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <Text as="h3" id={id} variant="body-medium" weight="bold">
            {title}
          </Text>
          {count !== undefined ? (
            <span className={classes.count}>{count}</span>
          ) : null}
        </Flex>
        {children}
      </Flex>
    </section>
  );
}

/** The cluster-wide notices on what the route metrics can't tell. */
function RouteNotices({ routes }: { routes: HttpRoute[] }) {
  const conditions = unavailableCause(routes);
  const backends = backendsUnavailableCause(routes);
  return (
    <>
      {conditions ? (
        <Alert status="info" icon title={unavailableNotice[conditions]} />
      ) : null}
      {backends ? (
        <Alert status="info" icon title={backendsUnavailableNotice[backends]} />
      ) : null}
    </>
  );
}

function PolicyNotices({
  policies,
  error,
}: {
  policies: GatewayPolicy[];
  error?: unknown;
}) {
  if (error) {
    return (
      <MetricsUnavailableAlert
        error={error}
        title="Envoy Gateway policies could not be loaded."
        description={error instanceof Error ? error.message : undefined}
      />
    );
  }
  const cause = policiesUnavailableCause(policies);
  return cause ? (
    <Alert status="info" icon title={policiesUnavailableNotice[cause]} />
  ) : null;
}

function PoliciesSection({
  rows,
  policies,
  error,
  query,
  emptyText,
}: {
  rows: GatewayPolicyRow[];
  policies: GatewayPolicy[];
  error?: unknown;
  query: string;
  emptyText: string;
}) {
  return (
    <SubSection
      title="Envoy Gateway policies"
      count={error ? undefined : rows.length}
    >
      <PolicyNotices policies={policies} error={error} />
      {error ? null : (
        <PlatformGatewayPoliciesTable
          aria-label="Envoy Gateway policies"
          rows={rows}
          query={query}
          emptyState={
            <Text variant="body-medium" color="secondary">
              {emptyText}
            </Text>
          }
        />
      )}
    </SubSection>
  );
}

/** What the page shows under the table: the selected Gateway's parts. */
function GatewayDetails({
  view,
  routes,
  policies,
  policiesError,
  query,
}: {
  view: GatewayView;
  routes: HttpRoute[];
  policies: GatewayPolicy[];
  policiesError?: unknown;
  query: string;
}) {
  const headingId = useId();
  const { gateway } = view;
  return (
    <section aria-labelledby={headingId}>
      <Flex direction="column" gap="6">
        <Flex align="baseline" gap="3" style={{ flexWrap: 'wrap' }}>
          <Text
            as="h2"
            id={headingId}
            variant="title-x-small"
            weight="bold"
            style={{ overflowWrap: 'anywhere', minWidth: 0 }}
          >
            {gateway.name}
          </Text>
          <Text variant="body-small" color="secondary">
            {[
              `Gateway in ${gateway.namespace}`,
              gateway.className ? `class ${gateway.className}` : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Flex>
        <SubSection title="Listeners">
          <PlatformGatewayListenersTable listeners={gateway.listeners} />
        </SubSection>
        <SubSection title="HTTP routes" count={view.routes.length}>
          <RouteNotices routes={routes} />
          <PlatformGatewayRoutesTable
            aria-label="HTTP routes"
            rows={view.routes}
            parentColumn="listener"
            query={query}
            emptyState={
              <Text variant="body-medium" color="secondary">
                No HTTP routes are attached to this Gateway.
              </Text>
            }
          />
        </SubSection>
        <PoliciesSection
          rows={view.policies}
          policies={policies}
          error={policiesError}
          query={query}
          emptyText="No Envoy Gateway policies apply to this Gateway."
        />
      </Flex>
    </section>
  );
}

export type PlatformClusterGatewaysContentProps = {
  clusterName: string;
  gateways: Gateway[];
  routes: HttpRoute[];
  isLoading: boolean;
  error?: unknown;
  policies: GatewayPolicy[];
  policiesLoading: boolean;
  policiesError?: unknown;
  /** `?gateway=`, the key of the Gateway shown below the table. */
  selected: string | undefined;
  onSelect: (key: string) => void;
};

/**
 * The Gateways tab's content: the finder, the Gateways table, the selected
 * Gateway's listeners, HTTP routes and policies, and what no Gateway takes.
 * Data loading lives in `PlatformClusterGateways`.
 */
export function PlatformClusterGatewaysContent({
  clusterName,
  gateways,
  routes,
  isLoading: topologyLoading,
  error,
  policies,
  policiesLoading,
  policiesError,
  selected,
  onSelect,
}: PlatformClusterGatewaysContentProps) {
  const [query, setQuery] = useState('');
  const unattachedId = useId();
  // The counts and the placing of policies need both reads.
  const isLoading = topologyLoading || policiesLoading;
  const shownPolicies = useMemo(
    () => (policiesError ? [] : policies),
    [policies, policiesError],
  );
  const views = useMemo(
    () =>
      error
        ? buildGatewayViews([], [], shownPolicies)
        : buildGatewayViews(gateways, routes, shownPolicies),
    [error, gateways, routes, shownPolicies],
  );
  const isSearching = normalizeQuery(query) !== '';
  const matches = useMemo(() => {
    const found = new Map<string, GatewayMatch>();
    for (const view of views.gateways) {
      const match = matchGateway(view, query);
      if (match) found.set(view.key, match);
    }
    return found;
  }, [views, query]);
  const listed = isSearching
    ? views.gateways.filter(view => matches.has(view.key))
    : views.gateways;
  // The first Gateway unless the address names one the cluster has.
  const shown =
    views.gateways.find(view => view.key === selected) ?? views.gateways[0];

  const onSearch = (value: string) => {
    setQuery(value);
    // The finder selects the first Gateway it finds something on.
    const first = views.gateways.find(view => matchGateway(view, value));
    if (first && first.key !== shown?.key) onSelect(first.key);
  };

  const { unattached } = views;
  const hasUnattached =
    !isLoading &&
    (unattached.routes.length > 0 || unattached.policies.length > 0);
  const unattachedMatches =
    isSearching &&
    (unattached.routes.some(row => routeMatches(row.route, query)) ||
      unattached.policies.some(row => policyMatches(row.policy, query)));

  let emptyState: ReactNode = (
    <Text variant="body-medium" color="secondary">
      No Gateways found on cluster <code>{clusterName}</code>.
    </Text>
  );
  if (isSearching) {
    emptyState = (
      <Text variant="body-medium" color="secondary">
        {`No gateway has a route, hostname or policy matching "${query.trim()}".`}
        {unattachedMatches
          ? ' Matches outside any gateway are marked below.'
          : ''}
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="7">
      <Flex direction="column" gap="3">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--bui-space-3)',
          }}
        >
          <div style={{ flex: '0 1 460px', minWidth: 'min(260px, 100%)' }}>
            <SearchField
              aria-label="Find a gateway by hostname, route or policy"
              placeholder="Find a gateway by hostname, route or policy"
              value={query}
              onChange={onSearch}
              isDisabled={isLoading || Boolean(error)}
            />
          </div>
          <Text variant="body-small" color="secondary">
            Status from Gateway API metrics; changes can take a minute or two to
            appear.
          </Text>
        </div>
        {error ? (
          <MetricsUnavailableAlert
            error={error}
            title="Gateway API metrics could not be loaded."
            description={error instanceof Error ? error.message : undefined}
          />
        ) : (
          <PlatformGatewaysTable
            gateways={listed}
            isLoading={isLoading}
            selected={shown?.key}
            onSelect={onSelect}
            matches={matches}
            query={query}
            emptyState={emptyState}
          />
        )}
      </Flex>
      {!isLoading && shown ? (
        // Keyed by the Gateway, so another one's tables start afresh.
        <GatewayDetails
          key={shown.key}
          view={shown}
          routes={routes}
          policies={shownPolicies}
          policiesError={policiesError}
          query={query}
        />
      ) : null}
      {error && !isLoading ? (
        // Without the topology no policy can be placed: all are listed.
        <PoliciesSection
          rows={unattached.policies}
          policies={shownPolicies}
          error={policiesError}
          query={query}
          emptyText={`No Envoy Gateway policies found on cluster ${clusterName}.`}
        />
      ) : null}
      {hasUnattached && !error ? (
        <section aria-labelledby={unattachedId}>
          <Flex direction="column" gap="6">
            <Flex direction="column" gap="1">
              <Text
                as="h2"
                id={unattachedId}
                variant="title-x-small"
                weight="bold"
              >
                Not attached to a gateway
              </Text>
              <Text variant="body-medium" color="secondary">
                The metrics don't say which Gateway these belong to: a route
                attached through a ListenerSet or to no Gateway on this cluster,
                a policy whose targets are selected by labels or don't exist.
              </Text>
            </Flex>
            {unattached.routes.length > 0 ? (
              <SubSection title="HTTP routes" count={unattached.routes.length}>
                <PlatformGatewayRoutesTable
                  aria-label="HTTP routes not attached to a gateway"
                  rows={unattached.routes}
                  parentColumn="parent"
                  query={query}
                  emptyState={null}
                />
              </SubSection>
            ) : null}
            {unattached.policies.length > 0 ? (
              <SubSection
                title="Envoy Gateway policies"
                count={unattached.policies.length}
              >
                <PlatformGatewayPoliciesTable
                  aria-label="Envoy Gateway policies not attached to a gateway"
                  rows={unattached.policies}
                  query={query}
                  emptyState={null}
                />
              </SubSection>
            ) : null}
          </Flex>
        </section>
      ) : null}
    </Flex>
  );
}

/**
 * The Gateways tab of a Platform cluster page
 * (`/platform/clusters/<inst>/<ns>/<name>/gateways`): the cluster's Gateway
 * API Gateways from Mimir, as the classic tab reads them, one selected
 * (`?gateway=<namespace>/<name>`, the first by default) with its listeners,
 * HTTP routes and Envoy Gateway policies below.
 */
export function PlatformClusterGateways() {
  const { installationName, cluster } = useCurrentCluster();
  const clusterName = cluster.getName();
  const [selected, onSelect] = useSelectedGateway();
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
    <PlatformClusterGatewaysContent
      clusterName={clusterName}
      gateways={gateways}
      routes={routes}
      isLoading={isLoading}
      error={error}
      policies={policies}
      policiesLoading={policiesLoading}
      policiesError={policiesError}
      selected={selected}
      onSelect={onSelect}
    />
  );
}
