import { MimirMetricSample } from '../../apis/mimir/types';

/**
 * The state of one status condition as far as the metrics can tell.
 *
 * `not-reported` and `not-available` are deliberately distinct from `false`:
 * - `not-reported`: the cluster exports the condition metric, but there is no
 *   series for this object, so the controller has not written the condition
 *   (yet).
 * - `not-available`: the condition can't be shown. `cause` says why: the
 *   query failed (`load-failed`), or the cluster exports no series of the
 *   condition metric at all because its observability-bundle predates it
 *   (`not-exported`).
 * Neither may ever be rendered as healthy.
 */
export type ConditionState =
  | { status: 'true'; reason?: string }
  | { status: 'false'; reason?: string }
  | { status: 'not-reported' }
  | { status: 'not-available'; cause?: 'load-failed' | 'not-exported' };

const loadFailed: ConditionState = {
  status: 'not-available',
  cause: 'load-failed',
};
const notExported: ConditionState = {
  status: 'not-available',
  cause: 'not-exported',
};

export interface GatewayListener {
  name: string;
  protocol?: string;
  port?: string;
  hostname?: string;
  tlsMode?: string;
  /** Undefined when the Gateway status has no entry for the listener. */
  attachedRoutes?: number;
}

export interface Gateway {
  id: string;
  namespace: string;
  name: string;
  className?: string;
  accepted: ConditionState;
  programmed: ConditionState;
  listeners: GatewayListener[];
}

/**
 * The parent kinds this view shows. A route attached through a ListenerSet
 * reports its conditions against the ListenerSet, not the Gateway behind it.
 */
export type HttpRouteParentKind = 'Gateway' | 'ListenerSet';

export interface HttpRouteParent {
  kind: HttpRouteParentKind;
  namespace: string;
  name: string;
  /** Empty when the parentRef attaches to the whole Gateway or ListenerSet. */
  sectionName: string;
  /** Set when the parentRef selects listeners by port. */
  port?: string;
  accepted: ConditionState;
  resolvedRefs: ConditionState;
}

export interface HttpRoute {
  id: string;
  namespace: string;
  name: string;
  /** Undefined when the hostnames could not be loaded. */
  hostnames: string[] | undefined;
  parents: HttpRouteParent[];
}

/**
 * Samples per metric. An optional input is `undefined` when its query failed;
 * whatever it would have shown is then reported as `not-available`.
 */
export interface GatewayTopologyInputs {
  gatewayInfo: MimirMetricSample[];
  gatewayStatus: MimirMetricSample[] | undefined;
  listenerInfo: MimirMetricSample[];
  listenerAttachedRoutes: MimirMetricSample[] | undefined;
  routeParentInfo: MimirMetricSample[];
  routeHostnameInfo: MimirMetricSample[] | undefined;
  /**
   * `status.parents` of the HTTPRoutes. Exported by every bundle version, so it
   * tells "the controller wrote status" apart from "the bundle can't export
   * the conditions".
   */
  routeStatusParentInfo: MimirMetricSample[] | undefined;
  routeAccepted: MimirMetricSample[] | undefined;
  routeResolvedRefs: MimirMetricSample[] | undefined;
}

export interface GatewayTopology {
  gateways: Gateway[];
  routes: HttpRoute[];
}

function finiteValue(sample: MimirMetricSample): number | undefined {
  const value = Number(sample.value[1]);
  return Number.isFinite(value) ? value : undefined;
}

function objectKey(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}

/**
 * A parentRef may omit its kind, which then defaults to Gateway, and its
 * namespace, which then defaults to the route's own. Normalising both the spec
 * and the status side keeps them joinable.
 */
function parentKind(labels: Record<string, string>): string {
  return labels.parent_kind || 'Gateway';
}

function isShownParentKind(kind: string): kind is HttpRouteParentKind {
  return kind === 'Gateway' || kind === 'ListenerSet';
}

function parentKey(
  routeNamespace: string,
  routeName: string,
  labels: Record<string, string>,
): string {
  return [
    routeNamespace,
    routeName,
    parentKind(labels),
    labels.parent_namespace || routeNamespace,
    labels.parent_name ?? '',
    labels.parent_section_name ?? '',
    labels.parent_port ?? '',
  ].join('/');
}

function toCondition(sample: MimirMetricSample): ConditionState | undefined {
  const value = finiteValue(sample);
  if (value === undefined) return undefined;
  const reason = sample.metric.reason || undefined;
  return value === 1 ? { status: 'true', reason } : { status: 'false', reason };
}

/**
 * Several series can share a key, for example when two controllers report
 * status for the same parent. Keep the worst, so a `false` is never hidden by
 * a `true` that happens to come first in the response.
 */
function setWorst(
  map: Map<string, ConditionState>,
  key: string,
  condition: ConditionState,
) {
  const existing = map.get(key);
  if (
    !existing ||
    (existing.status === 'true' && condition.status === 'false')
  ) {
    map.set(key, condition);
  }
}

function indexRouteConditions(
  samples: MimirMetricSample[],
): Map<string, ConditionState> {
  const byParent = new Map<string, ConditionState>();
  for (const sample of samples) {
    const { namespace, name } = sample.metric;
    if (!namespace || !name) continue;
    const condition = toCondition(sample);
    if (condition) {
      setWorst(byParent, parentKey(namespace, name, sample.metric), condition);
    }
  }
  return byParent;
}

function indexParentKeys(samples: MimirMetricSample[]): Set<string> {
  const keys = new Set<string>();
  for (const sample of samples) {
    const { namespace, name } = sample.metric;
    if (namespace && name) keys.add(parentKey(namespace, name, sample.metric));
  }
  return keys;
}

/**
 * Without a condition series, the status entry decides what is missing: if the
 * controller wrote status for the parent, the cluster can't export the
 * condition (an older observability-bundle); if it didn't, the condition is
 * simply not reported (yet), for example because the controller is down.
 */
function routeCondition(
  conditions: Map<string, ConditionState> | undefined,
  statusParents: Set<string> | undefined,
  key: string,
): ConditionState {
  if (!conditions) return loadFailed;
  const condition = conditions.get(key);
  if (condition) return condition;
  if (conditions.size > 0) return { status: 'not-reported' };
  if (!statusParents) return loadFailed;
  return statusParents.has(key) ? notExported : { status: 'not-reported' };
}

function gatewayCondition(
  statusByGateway: Map<string, Map<string, ConditionState>> | undefined,
  key: string,
  type: string,
): ConditionState {
  if (!statusByGateway) return loadFailed;
  return statusByGateway.get(key)?.get(type) ?? { status: 'not-reported' };
}

function indexGatewayStatus(
  samples: MimirMetricSample[],
): Map<string, Map<string, ConditionState>> {
  const statusByGateway = new Map<string, Map<string, ConditionState>>();
  for (const sample of samples) {
    const { namespace, name, type } = sample.metric;
    if (!namespace || !name || !type) continue;
    const condition = toCondition(sample);
    if (!condition) continue;
    const key = objectKey(namespace, name);
    let byType = statusByGateway.get(key);
    if (!byType) {
      byType = new Map();
      statusByGateway.set(key, byType);
    }
    setWorst(byType, type, condition);
  }
  return statusByGateway;
}

function buildGateways(inputs: GatewayTopologyInputs): Gateway[] {
  const statusByGateway = inputs.gatewayStatus
    ? indexGatewayStatus(inputs.gatewayStatus)
    : undefined;

  const attachedRoutes = new Map<string, number>();
  for (const sample of inputs.listenerAttachedRoutes ?? []) {
    const { namespace, name, listener_name: listenerName } = sample.metric;
    const value = finiteValue(sample);
    if (!namespace || !name || !listenerName || value === undefined) continue;
    attachedRoutes.set(`${objectKey(namespace, name)}/${listenerName}`, value);
  }

  const listenersByGateway = new Map<string, Map<string, GatewayListener>>();
  for (const sample of inputs.listenerInfo) {
    const { namespace, name, listener_name: listenerName } = sample.metric;
    if (!namespace || !name || !listenerName) continue;
    const key = objectKey(namespace, name);
    let listeners = listenersByGateway.get(key);
    if (!listeners) {
      listeners = new Map();
      listenersByGateway.set(key, listeners);
    }
    if (listeners.has(listenerName)) continue;
    listeners.set(listenerName, {
      name: listenerName,
      protocol: sample.metric.protocol || undefined,
      port: sample.metric.port || undefined,
      hostname: sample.metric.hostname || undefined,
      tlsMode: sample.metric.tls_mode || undefined,
      attachedRoutes: attachedRoutes.get(`${key}/${listenerName}`),
    });
  }

  // A Gateway is known from its info series, or from any of its listeners if
  // the info series is missing.
  const gateways = new Map<string, Gateway>();
  const ensureGateway = (namespace: string, name: string) => {
    const key = objectKey(namespace, name);
    let gateway = gateways.get(key);
    if (!gateway) {
      gateway = {
        id: key,
        namespace,
        name,
        accepted: gatewayCondition(statusByGateway, key, 'Accepted'),
        programmed: gatewayCondition(statusByGateway, key, 'Programmed'),
        listeners: Array.from(listenersByGateway.get(key)?.values() ?? []).sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      };
      gateways.set(key, gateway);
    }
    return gateway;
  };

  for (const sample of inputs.gatewayInfo) {
    const { namespace, name } = sample.metric;
    if (!namespace || !name) continue;
    const gateway = ensureGateway(namespace, name);
    gateway.className ??= sample.metric.gatewayclass_name || undefined;
  }
  for (const key of listenersByGateway.keys()) {
    const [namespace, name] = key.split('/');
    ensureGateway(namespace, name);
  }

  return Array.from(gateways.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function buildRoutes(inputs: GatewayTopologyInputs): HttpRoute[] {
  const accepted = inputs.routeAccepted
    ? indexRouteConditions(inputs.routeAccepted)
    : undefined;
  const resolvedRefs = inputs.routeResolvedRefs
    ? indexRouteConditions(inputs.routeResolvedRefs)
    : undefined;
  const statusParents = inputs.routeStatusParentInfo
    ? indexParentKeys(inputs.routeStatusParentInfo)
    : undefined;

  const routes = new Map<
    string,
    { route: HttpRoute; parentKeys: Set<string>; hostnames: Set<string> }
  >();
  const ensureRoute = (namespace: string, name: string) => {
    const key = objectKey(namespace, name);
    let entry = routes.get(key);
    if (!entry) {
      entry = {
        route: { id: key, namespace, name, hostnames: [], parents: [] },
        parentKeys: new Set(),
        hostnames: new Set(),
      };
      routes.set(key, entry);
    }
    return entry;
  };

  for (const sample of inputs.routeParentInfo) {
    const { namespace, name } = sample.metric;
    if (!namespace || !name || !sample.metric.parent_name) continue;
    // Only Gateway and ListenerSet parents are part of this view.
    const kind = parentKind(sample.metric);
    if (!isShownParentKind(kind)) continue;
    const entry = ensureRoute(namespace, name);
    const key = parentKey(namespace, name, sample.metric);
    if (entry.parentKeys.has(key)) continue;
    entry.parentKeys.add(key);
    entry.route.parents.push({
      kind,
      namespace: sample.metric.parent_namespace || namespace,
      name: sample.metric.parent_name,
      sectionName: sample.metric.parent_section_name ?? '',
      port: sample.metric.parent_port || undefined,
      accepted: routeCondition(accepted, statusParents, key),
      resolvedRefs: routeCondition(resolvedRefs, statusParents, key),
    });
  }

  // Hostnames only enrich routes already listed: a route attached to nothing
  // but other kinds (a mesh Service) is not part of this view.
  for (const sample of inputs.routeHostnameInfo ?? []) {
    const { namespace, name, hostname } = sample.metric;
    if (!namespace || !name || !hostname) continue;
    routes.get(objectKey(namespace, name))?.hostnames.add(hostname);
  }

  return Array.from(routes.values())
    .map(({ route, hostnames }) => ({
      ...route,
      hostnames: inputs.routeHostnameInfo
        ? Array.from(hostnames).sort()
        : undefined,
      parents: route.parents.sort((a, b) =>
        `${a.kind}/${a.namespace}/${a.name}/${a.sectionName}/${a.port ?? ''}`.localeCompare(
          `${b.kind}/${b.namespace}/${b.name}/${b.sectionName}/${b.port ?? ''}`,
        ),
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Joins the Gateway API metrics of one cluster into Gateways with their
 * listeners, and HTTPRoutes with their parents and conditions.
 */
export function buildGatewayTopology(
  inputs: GatewayTopologyInputs,
): GatewayTopology {
  return { gateways: buildGateways(inputs), routes: buildRoutes(inputs) };
}

/** True when a route has at least one parent condition that is `false`. */
export function isRouteBroken(route: HttpRoute): boolean {
  return route.parents.some(
    parent =>
      parent.accepted.status === 'false' ||
      parent.resolvedRefs.status === 'false',
  );
}

/**
 * Sort rank of a set of conditions: 0 when any is `false`, 1 when any is not
 * reported, 2 otherwise. A missing status likely means nothing is serving, so
 * it belongs right after the failures, not among the healthy entries.
 */
export function conditionsRank(conditions: ConditionState[]): number {
  if (conditions.some(c => c.status === 'false')) return 0;
  if (conditions.some(c => c.status === 'not-reported')) return 1;
  return 2;
}

export function routeRank(route: HttpRoute): number {
  return conditionsRank(
    route.parents.flatMap(parent => [parent.accepted, parent.resolvedRefs]),
  );
}

export function gatewayRank(gateway: Gateway): number {
  return conditionsRank([gateway.accepted, gateway.programmed]);
}
