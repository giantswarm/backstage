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

/** A condition: its value, and the reason it carries. */
type FixtureCondition = { value: 0 | 1; reason: string };

const ok = (reason: string): FixtureCondition => ({ value: 1, reason });
const failed = (reason: string): FixtureCondition => ({ value: 0, reason });

/** A listener of a Gateway, as `gatewayapi_gateway_listener_info` labels it. */
type FixtureListener = {
  listener_name: string;
  protocol: string;
  port: string;
  hostname?: string;
  tls_mode?: string;
};

/** A Gateway of the fixture clusters, with its two conditions. */
type FixtureGateway = {
  namespace: string;
  name: string;
  className: string;
  accepted: FixtureCondition;
  programmed: FixtureCondition;
  listeners: FixtureListener[];
};

/**
 * A parentRef of a route and the status the controller wrote for it. Without
 * `accepted`, the controller wrote no status for the parent, as for a route
 * it hasn't reached yet.
 */
type FixtureParent = {
  kind?: 'ListenerSet';
  namespace: string;
  name: string;
  section: string;
  accepted?: FixtureCondition;
  resolvedRefs?: FixtureCondition;
};

/** A backendRef of a rule; a missing namespace is the route's. */
type FixtureBackend = {
  name: string;
  namespace?: string;
  port: number;
  weight?: number;
};

/** One rule: its first path match and its backends, none for a redirect. */
type FixtureRule = { path: string; backends: FixtureBackend[] };

/** An HTTPRoute of the fixture clusters. */
type FixtureRoute = {
  namespace: string;
  name: string;
  hostnames: string[];
  parents: FixtureParent[];
  rules: FixtureRule[];
};

/** The Gateways of one cluster, by their part in it. */
type FixtureGateways = {
  /** The Gateway the Gateway API bundle installs. */
  main: FixtureGateway;
  /** A team's own Gateway for internal traffic. */
  internal: FixtureGateway;
  /** A Gateway Envoy Gateway could not program. */
  legacy: FixtureGateway;
};

/**
 * The Gateways of a cluster: the bundle's `giantswarm-default` with http and
 * https listeners, a team's internal Gateway, and one that is accepted but
 * not programmed. In `long-names`, the internal Gateway's name is as long as
 * a Kubernetes name may be.
 */
function gatewaysOf(cluster: string, longSuffix?: string): FixtureGateways {
  const baseDomain = `${cluster}.example.com`;
  return {
    main: {
      namespace: 'envoy-gateway-system',
      name: 'giantswarm-default',
      className: 'giantswarm-default',
      accepted: ok('Accepted'),
      programmed: ok('Programmed'),
      listeners: [
        { listener_name: 'http', protocol: 'HTTP', port: '80' },
        {
          listener_name: 'https',
          protocol: 'HTTPS',
          port: '443',
          hostname: `*.${baseDomain}`,
          tls_mode: 'Terminate',
        },
      ],
    },
    internal: {
      namespace: 'payments',
      name: longSuffix
        ? fitName(
            `payments-internal-${longSuffix}-${longSuffix}`,
            MAX_NAME_LENGTH,
          )
        : 'payments-internal',
      className: 'envoy-internal',
      accepted: ok('Accepted'),
      programmed: ok('Programmed'),
      listeners: [
        {
          listener_name: 'internal-https',
          protocol: 'HTTPS',
          port: '443',
          hostname: `*.internal.${baseDomain}`,
          tls_mode: 'Terminate',
        },
      ],
    },
    legacy: {
      namespace: 'envoy-gateway-system',
      name: 'legacy-edge',
      className: 'giantswarm-default',
      accepted: ok('Accepted'),
      programmed: failed('AddressNotAssigned'),
      listeners: [{ listener_name: 'http', protocol: 'HTTP', port: '8080' }],
    },
  };
}

function onListener(
  gateway: FixtureGateway,
  section: string,
  accepted?: FixtureCondition,
  resolvedRefs?: FixtureCondition,
): FixtureParent {
  return {
    namespace: gateway.namespace,
    name: gateway.name,
    section,
    accepted,
    resolvedRefs,
  };
}

const ACCEPTED = ok('Accepted');
const RESOLVED = ok('ResolvedRefs');

/**
 * The routes of a cluster, one for each state the Gateways tab shows: a
 * healthy route with an uneven split to a backend in another namespace and a
 * redirect rule, a backend the route may not reference, a backend shared by
 * two rules and a second Gateway whose listener doesn't take its hostname, a
 * rule with as many backends as the metric exports, a route without status,
 * a route a ListenerSet rejects, a route with only a redirect, the main
 * Gateway's own HTTP to HTTPS redirect, two routes on the internal Gateway
 * and one on the Gateway that is not programmed.
 */
function routesOf(baseDomain: string, gw: FixtureGateways): FixtureRoute[] {
  const https = (
    accepted?: FixtureCondition,
    resolvedRefs?: FixtureCondition,
  ) => onListener(gw.main, 'https', accepted, resolvedRefs);
  return [
    {
      namespace: 'shop',
      name: 'storefront',
      hostnames: [`shop.${baseDomain}`],
      parents: [https(ACCEPTED, RESOLVED)],
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
      parents: [https(ACCEPTED, failed('RefNotPermitted'))],
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
      parents: [
        https(ACCEPTED, RESOLVED),
        onListener(
          gw.internal,
          'internal-https',
          failed('NoMatchingListenerHostname'),
          RESOLVED,
        ),
      ],
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
      parents: [https(ACCEPTED, RESOLVED)],
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
      parents: [https()],
      rules: [{ path: '/', backends: [{ name: 'admin-console', port: 3000 }] }],
    },
    {
      namespace: 'events',
      name: 'event-webhooks',
      hostnames: ['events.example.com'],
      parents: [
        {
          kind: 'ListenerSet',
          namespace: 'events',
          name: 'events-https',
          section: 'https',
          accepted: failed('NotAllowedByListeners'),
          resolvedRefs: RESOLVED,
        },
      ],
      rules: [{ path: '/', backends: [{ name: 'webhooks', port: 8080 }] }],
    },
    {
      namespace: 'shop',
      name: 'old-shop-redirect',
      hostnames: [`old-shop.${baseDomain}`],
      parents: [https(ACCEPTED, RESOLVED)],
      rules: [{ path: '/', backends: [] }],
    },
    {
      namespace: gw.main.namespace,
      name: `${gw.main.name}-tls-redirect`,
      hostnames: [],
      parents: [onListener(gw.main, 'http', ACCEPTED, RESOLVED)],
      rules: [{ path: '/', backends: [] }],
    },
    {
      namespace: 'payments',
      name: 'ledger-api',
      hostnames: [`ledger.internal.${baseDomain}`],
      parents: [onListener(gw.internal, 'internal-https', ACCEPTED, RESOLVED)],
      rules: [
        {
          path: '/',
          backends: [
            { name: 'ledger-api', port: 9090, weight: 80 },
            { name: 'ledger-api-canary', port: 9090, weight: 20 },
          ],
        },
      ],
    },
    {
      namespace: 'payments',
      name: 'settlement',
      hostnames: [`settlement.internal.${baseDomain}`],
      parents: [onListener(gw.internal, 'internal-https', ACCEPTED, RESOLVED)],
      rules: [{ path: '/', backends: [{ name: 'settlement', port: 8080 }] }],
    },
    {
      namespace: 'shop',
      name: 'legacy-storefront',
      hostnames: [`legacy.${baseDomain}`],
      parents: [onListener(gw.legacy, 'http', ACCEPTED, RESOLVED)],
      rules: [
        { path: '/', backends: [{ name: 'storefront-legacy', port: 80 }] },
      ],
    },
  ];
}

/** The namespace of the bundle's Gateway, kept in `long-names`. */
const GATEWAY_SYSTEM = 'envoy-gateway-system';

/** How many more Gateways the busiest cluster has in `many`. */
const MANY_GATEWAYS = 12;

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
      route.namespace === GATEWAY_SYSTEM
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

/** Gateways of teams of their own, one listener and no routes each. */
function teamGateways(baseDomain: string, count: number): FixtureGateway[] {
  return Array.from({ length: count }, (_, i) => ({
    namespace: `team-${i + 1}`,
    name: `team-${i + 1}-edge`,
    className: 'giantswarm-default',
    accepted: ok('Accepted'),
    programmed: ok('Programmed'),
    listeners: [
      {
        listener_name: 'https',
        protocol: 'HTTPS',
        port: '443',
        hostname: `*.team-${i + 1}.${baseDomain}`,
        tls_mode: 'Terminate',
      },
    ],
  }));
}

/**
 * The Gateway API and Envoy Gateway series of one installation's clusters,
 * as the kube-state-metrics of observability-bundle and the Gateway API
 * bundle export them: each ready workload cluster has the Gateways of
 * {@link gatewaysOf} with their listeners, the routes of {@link routesOf}
 * and a few policies; in `many`, the first one has {@link MANY_ROUTES}
 * routes and {@link MANY_GATEWAYS} more Gateways. Every third ready workload
 * cluster runs older bundles: the routes' conditions, the policies' targets
 * and status, and the rules' backends are missing there, as the metrics are,
 * so the tab shows that they are not available. The management cluster, and
 * a cluster being created or deleted, has no Gateway. Info series and
 * gauges, each a single point from the time the cluster was created.
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
    const isLong = cluster.name.length >= MAX_NAME_LENGTH - 3;
    const gateways = gatewaysOf(
      cluster.name,
      isLong ? cluster.name : undefined,
    );
    let routes = routesOf(`${cluster.name}.example.com`, gateways);
    if (isLong) {
      routes = longNamedRoutes(routes, cluster.name);
    }
    const all = [gateways.main, gateways.internal, gateways.legacy];
    if (many && index === 0) {
      routes = manyRoutes(routes, MANY_ROUTES);
      all.push(...teamGateways(`${cluster.name}.example.com`, MANY_GATEWAYS));
    }
    clusterSeries(series, cluster, all, routes, olderBundles);
    policySeries(series, cluster, gateways, routes, olderBundles);
  });
  return series;
}

type AddSeries = (
  name: string,
  labels: Record<string, string>,
  value?: number,
) => void;

function seriesAdder(
  series: FixtureCounterSeries[],
  cluster: FixtureCluster,
): AddSeries {
  const since = Date.parse(cluster.createdAt);
  return (name, labels, value = 1) =>
    series.push({
      labels: { __name__: name, cluster_id: cluster.name, ...labels },
      points: [[since, value]],
    });
}

function parentLabels(parent: FixtureParent): Record<string, string> {
  return {
    ...(parent.kind && { parent_kind: parent.kind }),
    parent_namespace: parent.namespace,
    parent_name: parent.name,
    parent_section_name: parent.section,
  };
}

function clusterSeries(
  series: FixtureCounterSeries[],
  cluster: FixtureCluster,
  gateways: FixtureGateway[],
  routes: FixtureRoute[],
  olderBundles: boolean,
) {
  const add = seriesAdder(series, cluster);

  for (const gateway of gateways) {
    const id = { namespace: gateway.namespace, name: gateway.name };
    add(GatewayApiGatewayInfo.name, {
      ...id,
      gatewayclass_name: gateway.className,
    });
    for (const [type, condition] of [
      ['Accepted', gateway.accepted],
      ['Programmed', gateway.programmed],
    ] as const) {
      add(
        GatewayApiGatewayStatus.name,
        { ...id, type, reason: condition.reason },
        condition.value,
      );
    }
    for (const listener of gateway.listeners) {
      add(GatewayApiGatewayListenerInfo.name, { ...id, ...listener });
      const attached = routes.filter(route =>
        route.parents.some(
          parent =>
            // Only a route the controller accepted is attached.
            parent.accepted?.value === 1 &&
            !parent.kind &&
            parent.namespace === gateway.namespace &&
            parent.name === gateway.name &&
            parent.section === listener.listener_name,
        ),
      ).length;
      add(
        GatewayApiGatewayStatusListenerAttachedRoutes.name,
        { ...id, listener_name: listener.listener_name },
        attached,
      );
    }
  }

  for (const route of routes) {
    const id = { namespace: route.namespace, name: route.name };
    for (const parent of route.parents) {
      const labels = { ...id, ...parentLabels(parent) };
      add(GatewayApiHttprouteParentInfo.name, labels);
      if (!parent.accepted) continue;
      add(GatewayApiHttprouteStatusParentInfo.name, labels);
      if (olderBundles) continue;
      add(
        GatewayApiHttprouteStatusParentAccepted.name,
        { ...labels, reason: parent.accepted.reason },
        parent.accepted.value,
      );
      if (parent.resolvedRefs) {
        add(
          GatewayApiHttprouteStatusParentResolvedRefs.name,
          { ...labels, reason: parent.resolvedRefs.reason },
          parent.resolvedRefs.value,
        );
      }
    }
    for (const hostname of route.hostnames) {
      add(GatewayApiHttprouteHostnameInfo.name, { ...id, hostname });
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
}

const POLICY_METRICS = {
  BackendTrafficPolicy: {
    created: EnvoyGatewayBackendTrafficPolicyCreated.name,
    target: EnvoyGatewayBackendTrafficPolicyTargetInfo.name,
    accepted: EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted.name,
  },
  ClientTrafficPolicy: {
    created: EnvoyGatewayClientTrafficPolicyCreated.name,
    target: EnvoyGatewayClientTrafficPolicyTargetInfo.name,
    accepted: EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted.name,
  },
  SecurityPolicy: {
    created: EnvoyGatewaySecurityPolicyCreated.name,
    target: EnvoyGatewaySecurityPolicyTargetInfo.name,
    accepted: EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name,
  },
} as const;

/** A policy, the Gateway that reports its status, and that status. */
type FixturePolicy = {
  kind: keyof typeof POLICY_METRICS;
  namespace: string;
  name: string;
  targetKind: 'HTTPRoute' | 'Gateway';
  targetName: string;
  /** Without one, Envoy Gateway wrote no status: the target is gone. */
  ancestor?: FixtureGateway;
  status?: FixtureCondition;
};

/**
 * Policies in the states the policies tables show: one accepted on a route,
 * one an ancestor rejects, one on the main Gateway itself, one whose target
 * does not exist, and two on the internal Gateway, one on the Gateway and
 * one on its route.
 */
function policySeries(
  series: FixtureCounterSeries[],
  cluster: FixtureCluster,
  gateways: FixtureGateways,
  routes: FixtureRoute[],
  olderBundles: boolean,
) {
  const add = seriesAdder(series, cluster);
  const created = Date.parse(cluster.createdAt) / 1000;
  // A name with a suffix, cut so the whole stays a Kubernetes name: the route
  // names are 63 long in long-names.
  const named = (base: string, suffix: string) =>
    `${fitName(base, MAX_NAME_LENGTH - suffix.length - 1)}-${suffix}`;
  const shop = routes[0];
  // Envoy Gateway reports a policy's status only once it reconciled the
  // route, so the invalid policy targets an accepted route.
  const admin =
    routes.find(
      route =>
        route !== shop &&
        route.parents.some(
          parent =>
            parent.accepted?.value === 1 && parent.name === gateways.main.name,
        ),
    ) ?? shop;
  // A route on the internal Gateway only.
  const ledger =
    routes.find(
      route =>
        route.parents.length > 0 &&
        route.parents.every(parent => parent.name === gateways.internal.name),
    ) ?? shop;
  const { main, internal } = gateways;
  const policies: FixturePolicy[] = [
    {
      kind: 'BackendTrafficPolicy',
      namespace: shop.namespace,
      name: named(shop.name, 'timeouts'),
      targetKind: 'HTTPRoute',
      targetName: shop.name,
      ancestor: main,
      status: ok('Accepted'),
    },
    {
      kind: 'SecurityPolicy',
      namespace: admin.namespace,
      name: named(admin.name, 'basic-auth'),
      targetKind: 'HTTPRoute',
      targetName: admin.name,
      ancestor: main,
      status: failed('Invalid'),
    },
    {
      kind: 'ClientTrafficPolicy',
      namespace: main.namespace,
      name: named(main.name, 'client'),
      targetKind: 'Gateway',
      targetName: main.name,
      ancestor: main,
      status: ok('Accepted'),
    },
    {
      kind: 'SecurityPolicy',
      namespace: shop.namespace,
      name: named(shop.name, 'retired-oidc'),
      targetKind: 'HTTPRoute',
      targetName: named(shop.name, 'retired'),
    },
    {
      kind: 'SecurityPolicy',
      namespace: internal.namespace,
      name: named(internal.name, 'ip-allow'),
      targetKind: 'Gateway',
      targetName: internal.name,
      ancestor: internal,
      status: ok('Accepted'),
    },
    {
      kind: 'BackendTrafficPolicy',
      namespace: ledger.namespace,
      name: named(ledger.name, 'retries'),
      targetKind: 'HTTPRoute',
      targetName: ledger.name,
      ancestor: internal,
      status: ok('Accepted'),
    },
  ];
  for (const policy of policies) {
    const metrics = POLICY_METRICS[policy.kind];
    const id = { namespace: policy.namespace, name: policy.name };
    add(metrics.created, id, created);
    if (olderBundles) continue;
    add(metrics.target, {
      ...id,
      target_group: 'gateway.networking.k8s.io',
      target_kind: policy.targetKind,
      target_name: policy.targetName,
    });
    if (policy.ancestor && policy.status) {
      add(
        metrics.accepted,
        {
          ...id,
          ancestor_group: 'gateway.networking.k8s.io',
          ancestor_kind: 'Gateway',
          ancestor_namespace: policy.ancestor.namespace,
          ancestor_name: policy.ancestor.name,
          reason: policy.status.reason,
        },
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
