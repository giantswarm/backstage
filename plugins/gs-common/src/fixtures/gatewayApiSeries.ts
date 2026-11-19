import {
  EnvoyGatewayBackendTrafficPolicyCreated,
  EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted,
  EnvoyGatewayBackendTrafficPolicyTargetInfo,
  EnvoyGatewayClientTrafficPolicyCreated,
  EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted,
  EnvoyGatewayClientTrafficPolicyTargetInfo,
  EnvoyGatewaySecurityPolicyCreated,
  EnvoyGatewaySecurityPolicyStatusAncestorAccepted,
  EnvoyGatewaySecurityPolicyTargetInfo,
  GatewayApiGatewayInfo,
  GatewayApiGatewayListenerInfo,
  GatewayApiGatewayStatus,
  GatewayApiGatewayStatusListenerAttachedRoutes,
  GatewayApiHttprouteHostnameInfo,
  GatewayApiHttprouteParentInfo,
  GatewayApiHttprouteRuleBackendInfo,
  GatewayApiHttprouteStatusParentAccepted,
  GatewayApiHttprouteStatusParentInfo,
  GatewayApiHttprouteStatusParentResolvedRefs,
} from '../mimirMetrics';
import type { FixtureCluster } from './clusterBuilders';
import type { FixtureDataSet } from './dataSet';
import type { FixtureCounterSeries } from './gatewayUsage';
import { fitName, MAX_NAME_LENGTH } from './names';

/** The namespace and name of the Gateway the Gateway API bundle installs. */
const GATEWAY = {
  namespace: 'envoy-gateway-system',
  name: 'giantswarm-default',
};

/** The parent labels of a route attached to the Gateway's HTTPS listener. */
const HTTPS_PARENT = {
  parent_namespace: GATEWAY.namespace,
  parent_name: GATEWAY.name,
  parent_section_name: 'https',
};

/** A condition of a route's parent: its value, and the reason it carries. */
type FixtureCondition = { value: 0 | 1; reason: string };

/** A backendRef of a rule; a missing namespace is the route's. */
type FixtureBackend = {
  name: string;
  namespace?: string;
  port: number;
  weight?: number;
};

/** One rule: its first path match and its backends, none for a redirect. */
type FixtureRule = { path: string; backends: FixtureBackend[] };

/**
 * An HTTPRoute of the fixture clusters. Without `accepted`, the controller
 * wrote no status for the route, as for a route it hasn't reached yet.
 */
type FixtureRoute = {
  namespace: string;
  name: string;
  hostnames: string[];
  parent: Record<string, string>;
  accepted?: FixtureCondition;
  resolvedRefs?: FixtureCondition;
  rules: FixtureRule[];
};

const ok = (reason: string): FixtureCondition => ({ value: 1, reason });
const failed = (reason: string): FixtureCondition => ({ value: 0, reason });

/**
 * The routes of a cluster, one for each state the Gateways tab shows: a
 * healthy route with an uneven split to a backend in another namespace and a
 * redirect rule, a backend the route may not reference, a backend shared by
 * two rules, a rule with as many backends as the metric exports, a route
 * without status, a route a ListenerSet rejects, a route with only a
 * redirect, and the Gateway's own HTTP to HTTPS redirect.
 */
function routesOf(baseDomain: string): FixtureRoute[] {
  return [
    {
      namespace: 'shop',
      name: 'storefront',
      hostnames: [`shop.${baseDomain}`],
      parent: HTTPS_PARENT,
      accepted: ok('Accepted'),
      resolvedRefs: ok('ResolvedRefs'),
      rules: [
        {
          path: '/',
          backends: [
            { name: 'storefront', port: 80, weight: 90 },
            {
              name: 'storefront-next',
              namespace: 'shop-preview',
              port: 80,
              weight: 10,
            },
          ],
        },
        { path: '/old-shop', backends: [] },
      ],
    },
    {
      namespace: 'shop',
      name: 'checkout',
      hostnames: [`checkout.${baseDomain}`],
      parent: HTTPS_PARENT,
      accepted: ok('Accepted'),
      resolvedRefs: failed('RefNotPermitted'),
      rules: [
        {
          path: '/',
          backends: [{ name: 'payments', namespace: 'payments', port: 8080 }],
        },
      ],
    },
    {
      namespace: 'api',
      name: 'public-api',
      hostnames: [`api.${baseDomain}`],
      parent: HTTPS_PARENT,
      accepted: ok('Accepted'),
      resolvedRefs: ok('ResolvedRefs'),
      rules: [
        {
          path: '/v1',
          backends: [
            { name: 'api', port: 8080, weight: 95 },
            { name: 'api-canary', port: 8080, weight: 5 },
          ],
        },
        { path: '/v2', backends: [{ name: 'api', port: 8080 }] },
      ],
    },
    {
      namespace: 'catalog',
      name: 'catalog',
      hostnames: [`catalog.${baseDomain}`],
      parent: HTTPS_PARENT,
      accepted: ok('Accepted'),
      resolvedRefs: ok('ResolvedRefs'),
      rules: [
        {
          path: '/',
          backends: [
            { name: 'catalog-a', port: 80 },
            { name: 'catalog-b', port: 80 },
            { name: 'catalog-c', port: 80 },
          ],
        },
      ],
    },
    {
      namespace: 'admin',
      name: 'admin-console',
      hostnames: [`admin.${baseDomain}`],
      parent: HTTPS_PARENT,
      rules: [{ path: '/', backends: [{ name: 'admin-console', port: 3000 }] }],
    },
    {
      namespace: 'events',
      name: 'event-webhooks',
      hostnames: ['events.example.com'],
      parent: {
        parent_kind: 'ListenerSet',
        parent_namespace: 'events',
        parent_name: 'events-https',
        parent_section_name: 'https',
      },
      accepted: failed('NotAllowedByListeners'),
      resolvedRefs: ok('ResolvedRefs'),
      rules: [{ path: '/', backends: [{ name: 'webhooks', port: 8080 }] }],
    },
    {
      namespace: 'shop',
      name: 'old-shop-redirect',
      hostnames: [`old-shop.${baseDomain}`],
      parent: HTTPS_PARENT,
      accepted: ok('Accepted'),
      resolvedRefs: ok('ResolvedRefs'),
      rules: [{ path: '/', backends: [] }],
    },
    {
      namespace: GATEWAY.namespace,
      name: `${GATEWAY.name}-tls-redirect`,
      hostnames: [],
      parent: { ...HTTPS_PARENT, parent_section_name: 'http' },
      accepted: ok('Accepted'),
      resolvedRefs: ok('ResolvedRefs'),
      rules: [{ path: '/', backends: [] }],
    },
  ];
}

/** How many routes the busiest cluster of an installation has in `many`. */
const MANY_ROUTES = 150;

/** Workload clusters per installation from which the scenario counts as `many`. */
const MANY_CLUSTERS = 50;

/**
 * A copy of `routes` with `count` routes in all, the extra ones numbered, for
 * a table of hundreds of rows.
 */
function manyRoutes(routes: FixtureRoute[], count: number): FixtureRoute[] {
  const result: FixtureRoute[] = [];
  for (let i = 0; result.length < count; i++) {
    const route = routes[i % routes.length];
    result.push(
      i < routes.length
        ? route
        : {
            ...route,
            name: `${route.name}-${Math.floor(i / routes.length)}`,
          },
    );
  }
  return result;
}

/**
 * The names of `routes` and of their namespaces and backends as long as a
 * Kubernetes name may be, for the `long-names` scenario.
 */
function longNamedRoutes(
  routes: FixtureRoute[],
  suffix: string,
): FixtureRoute[] {
  const long = (name: string) =>
    fitName(`${name}-${suffix}-${suffix}`, MAX_NAME_LENGTH);
  return routes.map(route => ({
    ...route,
    namespace:
      route.namespace === GATEWAY.namespace
        ? route.namespace
        : long(route.namespace),
    name: long(route.name),
    rules: route.rules.map(rule => ({
      ...rule,
      backends: rule.backends.map(backend => ({
        ...backend,
        name: long(backend.name),
        namespace: backend.namespace && long(backend.namespace),
      })),
    })),
  }));
}

/**
 * The Gateway API and Envoy Gateway series of one installation's clusters,
 * as the kube-state-metrics of observability-bundle and the Gateway API
 * bundle export them: each ready workload cluster has the bundle's Gateway
 * with its listeners, the routes of {@link routesOf} and a few policies; in
 * `many`, the first one has {@link MANY_ROUTES} routes. Every third ready
 * workload cluster runs older bundles: the routes' conditions, the policies'
 * targets and status, and the rules' backends are missing there, as the
 * metrics are, so the tab shows that they are not available. The management
 * cluster, and a cluster being created or deleted, has no Gateway. Info series and gauges, each a single point from
 * the time the cluster was created.
 */
export function gatewayApiSeriesOf(
  data: FixtureDataSet,
  installation: string,
): FixtureCounterSeries[] {
  const series: FixtureCounterSeries[] = [];
  // A cluster still being created has no Gateway yet, one being deleted no
  // longer serves: only the ready clusters export the series.
  const workloadClusters = data.clusters.filter(
    cluster =>
      cluster.installation === installation &&
      cluster.kind === 'workload' &&
      cluster.state === 'ready',
  );
  const many = workloadClusters.length >= MANY_CLUSTERS;

  workloadClusters.forEach((cluster, index) => {
    const olderBundles = index % 3 === 2;
    let routes = routesOf(`${cluster.name}.example.com`);
    if (cluster.name.length >= MAX_NAME_LENGTH - 3) {
      routes = longNamedRoutes(routes, cluster.name);
    }
    if (many && index === 0) {
      routes = manyRoutes(routes, MANY_ROUTES);
    }
    clusterSeries(series, cluster, routes, olderBundles);
  });
  return series;
}

function clusterSeries(
  series: FixtureCounterSeries[],
  cluster: FixtureCluster,
  routes: FixtureRoute[],
  olderBundles: boolean,
) {
  const since = Date.parse(cluster.createdAt);
  const add = (name: string, labels: Record<string, string>, value = 1) =>
    series.push({
      labels: { __name__: name, cluster_id: cluster.name, ...labels },
      points: [[since, value]],
    });

  add(GatewayApiGatewayInfo.name, {
    ...GATEWAY,
    gatewayclass_name: GATEWAY.name,
  });
  add(GatewayApiGatewayStatus.name, {
    ...GATEWAY,
    type: 'Accepted',
    reason: 'Accepted',
  });
  add(GatewayApiGatewayStatus.name, {
    ...GATEWAY,
    type: 'Programmed',
    reason: 'Programmed',
  });
  const listeners: Record<string, string>[] = [
    { listener_name: 'http', protocol: 'HTTP', port: '80' },
    {
      listener_name: 'https',
      protocol: 'HTTPS',
      port: '443',
      hostname: `*.${cluster.name}.example.com`,
      tls_mode: 'Terminate',
    },
  ];
  for (const listener of listeners) {
    add(GatewayApiGatewayListenerInfo.name, { ...GATEWAY, ...listener });
    const attached = routes.filter(
      route =>
        // Only a route the controller accepted is attached.
        route.accepted?.value === 1 &&
        !route.parent.parent_kind &&
        route.parent.parent_section_name === listener.listener_name,
    ).length;
    add(
      GatewayApiGatewayStatusListenerAttachedRoutes.name,
      { ...GATEWAY, listener_name: listener.listener_name },
      attached,
    );
  }

  for (const route of routes) {
    const id = { namespace: route.namespace, name: route.name };
    add(GatewayApiHttprouteParentInfo.name, { ...id, ...route.parent });
    for (const hostname of route.hostnames) {
      add(GatewayApiHttprouteHostnameInfo.name, { ...id, hostname });
    }
    if (route.accepted) {
      add(GatewayApiHttprouteStatusParentInfo.name, { ...id, ...route.parent });
      if (!olderBundles) {
        add(
          GatewayApiHttprouteStatusParentAccepted.name,
          { ...id, ...route.parent, reason: route.accepted.reason },
          route.accepted.value,
        );
        if (route.resolvedRefs) {
          add(
            GatewayApiHttprouteStatusParentResolvedRefs.name,
            { ...id, ...route.parent, reason: route.resolvedRefs.reason },
            route.resolvedRefs.value,
          );
        }
      }
    }
    if (olderBundles) continue;
    for (const rule of route.rules) {
      const labels: Record<string, string> = {
        ...id,
        match_path_type: 'PathPrefix',
        match_path: rule.path,
      };
      rule.backends.slice(0, 3).forEach((backend, i) => {
        labels[`backend${i}_kind`] = 'Service';
        labels[`backend${i}_name`] = backend.name;
        labels[`backend${i}_port`] = String(backend.port);
        labels[`backend${i}_weight`] = String(backend.weight ?? 1);
        if (backend.namespace) {
          labels[`backend${i}_namespace`] = backend.namespace;
        }
      });
      add(GatewayApiHttprouteRuleBackendInfo.name, labels);
    }
  }

  policySeries(add, routes, since, olderBundles);
}

/**
 * Three policies in the states the policies table shows: one accepted on the
 * Gateway, one an ancestor rejects, and one whose target does not exist.
 */
function policySeries(
  add: (name: string, labels: Record<string, string>, value?: number) => void,
  routes: FixtureRoute[],
  since: number,
  olderBundles: boolean,
) {
  const created = since / 1000;
  // A name with a suffix, cut so the whole stays a Kubernetes name: the route
  // names are 63 long in long-names.
  const named = (base: string, suffix: string) =>
    `${fitName(base, MAX_NAME_LENGTH - suffix.length - 1)}-${suffix}`;
  const shop = routes[0];
  // Envoy Gateway reports a policy's status only once it reconciled the
  // route, so the invalid policy targets an accepted route.
  const admin =
    routes.find(route => route !== shop && route.accepted?.value === 1) ?? shop;
  const ancestor = {
    ancestor_group: 'gateway.networking.k8s.io',
    ancestor_kind: 'Gateway',
    ancestor_namespace: GATEWAY.namespace,
    ancestor_name: GATEWAY.name,
  };
  const policies = [
    {
      created: EnvoyGatewayBackendTrafficPolicyCreated.name,
      target: EnvoyGatewayBackendTrafficPolicyTargetInfo.name,
      accepted: EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted.name,
      namespace: shop.namespace,
      name: named(shop.name, 'timeouts'),
      targetKind: 'HTTPRoute',
      targetName: shop.name,
      status: ok('Accepted'),
    },
    {
      created: EnvoyGatewaySecurityPolicyCreated.name,
      target: EnvoyGatewaySecurityPolicyTargetInfo.name,
      accepted: EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name,
      namespace: admin.namespace,
      name: named(admin.name, 'basic-auth'),
      targetKind: 'HTTPRoute',
      targetName: admin.name,
      status: failed('Invalid'),
    },
    {
      created: EnvoyGatewayClientTrafficPolicyCreated.name,
      target: EnvoyGatewayClientTrafficPolicyTargetInfo.name,
      accepted: EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted.name,
      namespace: GATEWAY.namespace,
      name: named(GATEWAY.name, 'client'),
      targetKind: 'Gateway',
      targetName: GATEWAY.name,
      status: ok('Accepted'),
    },
    {
      created: EnvoyGatewaySecurityPolicyCreated.name,
      target: EnvoyGatewaySecurityPolicyTargetInfo.name,
      accepted: undefined,
      namespace: shop.namespace,
      name: named(shop.name, 'retired-oidc'),
      targetKind: 'HTTPRoute',
      targetName: named(shop.name, 'retired'),
      status: undefined,
    },
  ];
  for (const policy of policies) {
    const id = { namespace: policy.namespace, name: policy.name };
    add(policy.created, id, created);
    if (olderBundles) continue;
    add(policy.target, {
      ...id,
      target_group: 'gateway.networking.k8s.io',
      target_kind: policy.targetKind,
      target_name: policy.targetName,
    });
    if (policy.accepted && policy.status) {
      add(
        policy.accepted,
        { ...id, ...ancestor, reason: policy.status.reason },
        policy.status.value,
      );
    }
  }
}

const built = new WeakMap<
  FixtureDataSet,
  Map<string, FixtureCounterSeries[]>
>();

/** {@link gatewayApiSeriesOf}, built once per data set and installation. */
export function gatewayApiSeries(
  data: FixtureDataSet,
  installation: string,
): FixtureCounterSeries[] {
  let byInstallation = built.get(data);
  if (!byInstallation) {
    byInstallation = new Map();
    built.set(data, byInstallation);
  }
  let series = byInstallation.get(installation);
  if (!series) {
    series = gatewayApiSeriesOf(data, installation);
    byInstallation.set(installation, series);
  }
  return series;
}
