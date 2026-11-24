import {
  type GatewayPolicy,
  type PolicyAncestor,
  isPolicyUnattached,
} from '../../utils/gatewayPolicies';
import {
  type ConditionState,
  type Gateway,
  type HttpRoute,
  type HttpRouteParent,
  conditionsRank,
  gatewayRank,
  routeRank,
} from '../../utils/gatewayTopology';
import {
  type ReferenceGrant,
  grantPermitsBackend,
  grantPermitsGateways,
} from '../../utils/gatewayReferenceGrants';
import { backendLabel } from '../../clusters/cluster-details/ClusterGateways/BackendList';
import {
  type NamedCondition,
  worstCondition,
} from '../../clusters/cluster-details/ClusterGateways/conditions';
import { UNATTACHED_REASON } from '../../clusters/cluster-details/ClusterGateways/PoliciesTable';
import type { StatusDotTone } from '@giantswarm/backstage-plugin-ui-react';

/** `<namespace>/<name>`: how `?gateway=` names a Gateway. */
export function gatewayKey(gateway: { namespace: string; name: string }) {
  return `${gateway.namespace}/${gateway.name}`;
}

/** A route on one of its parents: a row of the routes table. */
export type GatewayRouteRow = {
  id: string;
  route: HttpRoute;
  /** Undefined for a route without a Gateway or ListenerSet parent. */
  parent?: HttpRouteParent;
  /** The policies that target the route. */
  policies: GatewayPolicy[];
};

/** A policy as one Gateway sees it: a row of the policies table. */
export type GatewayPolicyRow = {
  id: string;
  policy: GatewayPolicy;
  /** The Gateway the row is under, undefined in the unattached section. */
  gateway?: Gateway;
  /** The status the row shows: the Gateway's ancestor's, else the worst. */
  status: ConditionState;
};

/** A ReferenceGrant as one Gateway uses it: a row of the grants table. */
export type GatewayReferenceGrantRow = {
  id: string;
  grant: ReferenceGrant;
  /**
   * The routes whose backends it lets them reach: the Gateway's routes, or
   * any route in the unattached section.
   */
  routes: HttpRoute[];
  /**
   * False when a route's backends aren't known (an older bundle, a failed
   * read, no topology), so `routes` may miss some.
   */
  routesKnown: boolean;
  /**
   * The namespace whose Gateways it lets reference into its own: the row's
   * Gateway's. Undefined when it lets no Gateway here do so.
   */
  gatewayNamespace?: string;
};

/** A Gateway with what the page shows under it. */
export type GatewayView = {
  /** {@link gatewayKey}, also the table row's id. */
  id: string;
  key: string;
  gateway: Gateway;
  routes: GatewayRouteRow[];
  policies: GatewayPolicyRow[];
  /** The ReferenceGrants its routes reach backends with, or it may use. */
  referenceGrants: GatewayReferenceGrantRow[];
  /** Distinct routes on this Gateway; `routes` has a row per parent. */
  routeCount: number;
  /** Distinct routes with a parent on this Gateway that fails. */
  failingRoutes: number;
};

/** What the page can't place under a Gateway. */
export type UnattachedItems = {
  routes: GatewayRouteRow[];
  policies: GatewayPolicyRow[];
  /** Grants no Gateway on the cluster or route of one is known to use. */
  referenceGrants: GatewayReferenceGrantRow[];
};

export type GatewayViews = {
  /** Failing Gateways first, as the classic tab orders them. */
  gateways: GatewayView[];
  unattached: UnattachedItems;
};

function isGatewayParent(parent: HttpRouteParent, gateway: Gateway) {
  return (
    parent.kind === 'Gateway' &&
    parent.namespace === gateway.namespace &&
    parent.name === gateway.name
  );
}

/**
 * An ancestor ref without a namespace is in the namespace of the object that
 * holds it, the policy, as for any Gateway API reference.
 */
function isGatewayAncestor(
  ancestor: PolicyAncestor,
  policy: GatewayPolicy,
  gateway: Gateway,
) {
  return (
    (ancestor.kind ?? 'Gateway') === 'Gateway' &&
    ancestor.name === gateway.name &&
    (ancestor.namespace ?? policy.namespace) === gateway.namespace
  );
}

function targetsRoute(policy: GatewayPolicy, route: HttpRoute): boolean {
  return (
    policy.namespace === route.namespace &&
    policy.targets.some(t => t.kind === 'HTTPRoute' && t.name === route.name)
  );
}

function targetsGateway(policy: GatewayPolicy, gateway: Gateway): boolean {
  return (
    policy.namespace === gateway.namespace &&
    policy.targets.some(t => t.kind === 'Gateway' && t.name === gateway.name)
  );
}

/** The worst of the policy's ancestors, or its own status without any. */
function overallPolicyStatus(policy: GatewayPolicy): ConditionState {
  if (policy.ancestors.length === 0) return policy.status;
  return worstCondition(
    policy.ancestors.map(a => ({ name: 'Accepted', condition: a.accepted })),
  )!.condition;
}

function policyRow(policy: GatewayPolicy, gateway?: Gateway): GatewayPolicyRow {
  const ancestor = gateway
    ? policy.ancestors.find(a => isGatewayAncestor(a, policy, gateway))
    : undefined;
  return {
    id: gateway ? `${gatewayKey(gateway)}|${policy.id}` : policy.id,
    policy,
    gateway,
    status: ancestor ? ancestor.accepted : overallPolicyStatus(policy),
  };
}

function routeRowId(route: HttpRoute, parent?: HttpRouteParent): string {
  return parent
    ? `${route.id}/${parent.kind}/${parent.namespace}/${parent.name}/${parent.sectionName}/${parent.port ?? ''}`
    : route.id;
}

/** Whether every route among `routes` reports its backends. */
function backendsKnown(routes: HttpRoute[]): boolean {
  return routes.every(route => route.backends.status === 'available');
}

/** The routes among `routes` the grant lets reach one of their backends. */
function routesPermitted(
  grant: ReferenceGrant,
  routes: HttpRoute[],
): HttpRoute[] {
  return routes.filter(
    route =>
      route.backends.status === 'available' &&
      route.backends.backends.some(backend =>
        grantPermitsBackend(grant, route.namespace, backend),
      ),
  );
}

/** Failing parents first, then those without status, as `routeRank`. */
function parentRank(parent: HttpRouteParent | undefined): number {
  return parent ? conditionsRank([parent.accepted, parent.resolvedRefs]) : 1;
}

/** Rejected policies first, then those without status. */
function policyRank(row: GatewayPolicyRow): number {
  if (row.status.status === 'false') return 0;
  if (isPolicyUnattached(row.policy) || row.status.status === 'not-reported')
    return 1;
  return 2;
}

/**
 * Places each route and policy under the Gateways it belongs to: a route by
 * its parents of kind Gateway, a policy by an ancestor that is the Gateway,
 * a target that is the Gateway, or a target that is one of its routes.
 * What no Gateway on the cluster takes, a route attached only through a
 * ListenerSet (no metric says which Gateway a ListenerSet belongs to) or a
 * policy whose targets aren't known, goes to `unattached`. A ReferenceGrant
 * goes under each Gateway with a route whose backend it lets the route
 * reach, and each Gateway in a namespace it lets reference into its own;
 * the others go to `unattached`.
 */
export function buildGatewayViews(
  gateways: Gateway[],
  routes: HttpRoute[],
  policies: GatewayPolicy[],
  referenceGrants: ReferenceGrant[] = [],
  /** False without the topology: no grant's use can be known. */
  topologyKnown = true,
): GatewayViews {
  const ordered = [...gateways].sort((a, b) => gatewayRank(a) - gatewayRank(b));
  const orderedRoutes = [...routes].sort((a, b) => routeRank(a) - routeRank(b));
  const policiesOf = (route: HttpRoute) =>
    policies.filter(policy => targetsRoute(policy, route));

  const placedRoutes = new Set<string>();
  const placedPolicies = new Set<string>();
  const placedGrants = new Set<string>();

  const views = ordered.map((gateway): GatewayView => {
    const rows: GatewayRouteRow[] = [];
    for (const route of orderedRoutes) {
      for (const parent of route.parents) {
        if (!isGatewayParent(parent, gateway)) continue;
        placedRoutes.add(routeRowId(route, parent));
        rows.push({
          id: routeRowId(route, parent),
          route,
          parent,
          policies: policiesOf(route),
        });
      }
    }
    rows.sort((a, b) => parentRank(a.parent) - parentRank(b.parent));
    const routeIds = new Set(rows.map(row => row.route.id));
    const policyRows = policies
      .filter(
        policy =>
          policy.ancestors.some(a => isGatewayAncestor(a, policy, gateway)) ||
          targetsGateway(policy, gateway) ||
          orderedRoutes.some(
            route => routeIds.has(route.id) && targetsRoute(policy, route),
          ),
      )
      .map(policy => {
        placedPolicies.add(policy.id);
        return policyRow(policy, gateway);
      })
      .sort((a, b) => policyRank(a) - policyRank(b));
    const gatewayRoutes = orderedRoutes.filter(route => routeIds.has(route.id));
    const grantRows = referenceGrants.flatMap(
      (grant): GatewayReferenceGrantRow[] => {
        const permitted = routesPermitted(grant, gatewayRoutes);
        const forGateway = grantPermitsGateways(grant, gateway.namespace);
        if (!permitted.length && !forGateway) return [];
        placedGrants.add(grant.id);
        return [
          {
            id: `${gatewayKey(gateway)}|${grant.id}`,
            grant,
            routes: permitted,
            routesKnown: backendsKnown(gatewayRoutes),
            gatewayNamespace: forGateway ? gateway.namespace : undefined,
          },
        ];
      },
    );
    return {
      id: gatewayKey(gateway),
      key: gatewayKey(gateway),
      gateway,
      routes: rows,
      policies: policyRows,
      referenceGrants: grantRows,
      routeCount: routeIds.size,
      failingRoutes: new Set(
        rows
          .filter(row => parentRank(row.parent) === 0)
          .map(row => row.route.id),
      ).size,
    };
  });

  const unattachedRoutes: GatewayRouteRow[] = [];
  for (const route of orderedRoutes) {
    const parents: (HttpRouteParent | undefined)[] = route.parents.length
      ? route.parents
      : [undefined];
    for (const parent of parents) {
      const id = routeRowId(route, parent);
      if (placedRoutes.has(id)) continue;
      unattachedRoutes.push({ id, route, parent, policies: policiesOf(route) });
    }
  }
  return {
    gateways: views,
    unattached: {
      routes: unattachedRoutes,
      policies: policies
        .filter(policy => !placedPolicies.has(policy.id))
        .map(policy => policyRow(policy))
        .sort((a, b) => policyRank(a) - policyRank(b)),
      referenceGrants: referenceGrants
        .filter(grant => !placedGrants.has(grant.id))
        .map(grant => ({
          id: grant.id,
          grant,
          // A route through a ListenerSet, or on no Gateway of the cluster.
          routes: routesPermitted(grant, orderedRoutes),
          routesKnown: topologyKnown && backendsKnown(orderedRoutes),
        })),
    },
  };
}

/** A status as the page shows it: a dot, a word, and a reason under it. */
export type StatusView = {
  tone: StatusDotTone;
  label: string;
  reason?: string;
  /** A sentence under the status, for one that needs explaining. */
  note?: string;
  /** A sentence on hover, for a status that needs explaining. */
  title?: string;
};

const NOT_REPORTED_TITLE = 'No controller has reported this condition yet.';

/** The words of a failing condition, by its name. */
const FAILED_LABELS: Record<string, string> = {
  Accepted: 'Not accepted',
  Programmed: 'Not programmed',
  ResolvedRefs: 'Refs not resolved',
};

/**
 * One status for several conditions: `healthy` when all are true, else the
 * failing one named ("Not programmed", with its reason), then "Not reported",
 * then "Not available".
 */
export function statusOf(
  conditions: readonly NamedCondition[],
  healthy: string,
): StatusView {
  const shown = worstCondition(conditions);
  if (!shown) return { tone: 'neutral', label: 'Not available' };
  const { condition, name } = shown;
  switch (condition.status) {
    case 'true':
      return { tone: 'success', label: healthy };
    case 'false':
      return {
        tone: 'danger',
        label: FAILED_LABELS[name] ?? `${name} false`,
        reason: condition.reason,
      };
    case 'not-reported':
      return {
        tone: 'warning',
        label: 'Not reported',
        title: NOT_REPORTED_TITLE,
      };
    default:
      return { tone: 'neutral', label: 'Not available' };
  }
}

/** "Programmed" when Accepted and Programmed are both true. */
export function gatewayStatus(gateway: Gateway): StatusView {
  return statusOf(
    [
      { name: 'Accepted', condition: gateway.accepted },
      { name: 'Programmed', condition: gateway.programmed },
    ],
    'Programmed',
  );
}

/** "Accepted" when Accepted and ResolvedRefs are both true. */
export function routeStatus(parent: HttpRouteParent | undefined): StatusView {
  if (!parent) return { tone: 'neutral', label: 'No parent' };
  return statusOf(
    [
      { name: 'Accepted', condition: parent.accepted },
      { name: 'ResolvedRefs', condition: parent.resolvedRefs },
    ],
    'Accepted',
  );
}

/** A policy's status, "No status reported" for one Envoy Gateway skipped. */
export function policyStatus(row: GatewayPolicyRow): StatusView {
  if (isPolicyUnattached(row.policy)) {
    return {
      tone: 'warning',
      label: 'No status reported',
      note: UNATTACHED_REASON,
    };
  }
  return statusOf([{ name: 'Accepted', condition: row.status }], 'Accepted');
}

/** The backends of a route as the table names them, for the search. */
export function backendNames(route: HttpRoute): string[] {
  return route.backends.status === 'available'
    ? route.backends.backends.map(b => backendLabel(b, route.namespace))
    : [];
}

/** The query as it is matched: trimmed, in lower case. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function has(text: string | undefined, needle: string): boolean {
  return text !== undefined && text.toLowerCase().includes(needle);
}

/** Whether a route row has what the query looks for. */
export function routeMatches(route: HttpRoute, query: string): boolean {
  const needle = normalizeQuery(query);
  if (!needle) return false;
  return [
    route.name,
    route.namespace,
    ...(route.hostnames ?? []),
    ...backendNames(route),
  ].some(value => has(value, needle));
}

/** Whether a policy row has what the query looks for: its name. */
export function policyMatches(policy: GatewayPolicy, query: string): boolean {
  const needle = normalizeQuery(query);
  return needle !== '' && has(policy.name, needle);
}

/** Whether a ReferenceGrant row has what the query looks for: its name. */
export function referenceGrantMatches(
  grant: ReferenceGrant,
  query: string,
): boolean {
  const needle = normalizeQuery(query);
  return needle !== '' && has(grant.name, needle);
}

/** What the finder found on a Gateway, for the line under its name. */
export type GatewayMatch = {
  kind:
    | 'Hostname'
    | 'Route'
    | 'Namespace'
    | 'Backend'
    | 'Policy'
    | 'ReferenceGrant'
    | 'Gateway';
  /** The value that matched, marked where the query occurs. */
  value: string;
  /** The route it belongs to, for a hostname, namespace or backend. */
  route?: string;
};

/**
 * The first thing on a Gateway the query matches, as the mockup reads it:
 * route by route a hostname, the route's name, its namespace, a backend;
 * then a policy; then a ReferenceGrant; then the Gateway's own name.
 * Undefined when nothing does.
 */
export function matchGateway(
  view: GatewayView,
  query: string,
): GatewayMatch | undefined {
  const needle = normalizeQuery(query);
  if (!needle) return undefined;
  for (const { route } of view.routes) {
    const hostname = route.hostnames?.find(h => has(h, needle));
    if (hostname)
      return { kind: 'Hostname', value: hostname, route: route.name };
    if (has(route.name, needle)) return { kind: 'Route', value: route.name };
    if (has(route.namespace, needle))
      return { kind: 'Namespace', value: route.namespace, route: route.name };
    const backend = backendNames(route).find(b => has(b, needle));
    if (backend) return { kind: 'Backend', value: backend, route: route.name };
  }
  const policy = view.policies.find(row => has(row.policy.name, needle));
  if (policy) return { kind: 'Policy', value: policy.policy.name };
  const grant = view.referenceGrants.find(row => has(row.grant.name, needle));
  if (grant) return { kind: 'ReferenceGrant', value: grant.grant.name };
  if (has(view.gateway.name, needle))
    return { kind: 'Gateway', value: view.gateway.name };
  return undefined;
}

/**
 * The listener a parent names: `https`, `https, port 443`, `port 443`; `All
 * listeners` for a parent that names neither.
 */
export function listenerOf(parent: HttpRouteParent): string {
  const parts = [
    parent.sectionName || undefined,
    parent.port ? `port ${parent.port}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'All listeners';
}

/** `ListenerSet events/events-https, https`: a parent outside any Gateway. */
export function parentOf(parent: HttpRouteParent | undefined): string {
  if (!parent) return 'No Gateway or ListenerSet parent';
  const listener = listenerOf(parent);
  return `${parent.kind} ${parent.namespace}/${parent.name}${
    listener === 'All listeners' ? '' : `, ${listener}`
  }`;
}

/** `HTTPS / 443`, as the listeners table names a protocol. */
export function protocolOf(listener: {
  protocol?: string;
  port?: string;
}): string {
  const protocol = listener.protocol ?? '—';
  return listener.port ? `${protocol} / ${listener.port}` : protocol;
}

/**
 * Whether a target of the policy is the Gateway: a target ref has no
 * namespace, so it names a Gateway in the policy's own.
 */
export function isTargetGateway(
  target: { kind: string; name: string },
  policy: GatewayPolicy,
  gateway: Gateway | undefined,
): boolean {
  return (
    gateway !== undefined &&
    target.kind === 'Gateway' &&
    target.name === gateway.name &&
    policy.namespace === gateway.namespace
  );
}
