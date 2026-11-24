import { MimirMetricSample } from '../../apis/mimir/types';
import {
  GatewayApiReferencegrantCreated,
  GatewayApiReferencegrantFromInfo,
  GatewayApiReferencegrantToInfo,
} from '@giantswarm/backstage-plugin-gs-common';

/** The metrics of a ReferenceGrant, read in one query. */
export const referenceGrantMetricNames = [
  GatewayApiReferencegrantCreated.name,
  GatewayApiReferencegrantFromInfo.name,
  GatewayApiReferencegrantToInfo.name,
] as const;

/** Resources in another namespace that may reference into the grant's. */
export interface ReferenceGrantFrom {
  group: string;
  kind: string;
  namespace: string;
}

/**
 * Resources in the grant's namespace that may be referenced. Without a name,
 * every resource of the kind may.
 */
export interface ReferenceGrantTo {
  group: string;
  kind: string;
  name?: string;
}

export interface ReferenceGrant {
  id: string;
  namespace: string;
  name: string;
  from: ReferenceGrantFrom[];
  to: ReferenceGrantTo[];
}

function compare(a: string[], b: string[]): number {
  for (let i = 0; i < a.length; i++) {
    const order = (a[i] ?? '').localeCompare(b[i] ?? '');
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * Joins the ReferenceGrant series of one cluster into grants, sorted by
 * namespace and name, each with its `from` and `to` entries. A grant is
 * listed when any of its series is there, so a grant whose `created` series
 * is missing still shows; duplicate series (two kube-state-metrics replicas)
 * count once.
 */
export function buildReferenceGrants(
  samples: MimirMetricSample[],
): ReferenceGrant[] {
  const grants = new Map<
    string,
    {
      grant: Omit<ReferenceGrant, 'from' | 'to'>;
      from: Map<string, ReferenceGrantFrom>;
      to: Map<string, ReferenceGrantTo>;
    }
  >();

  for (const { metric } of samples) {
    const { namespace, name } = metric;
    if (!namespace || !name) continue;
    const id = `${namespace}/${name}`;
    let entry = grants.get(id);
    if (!entry) {
      entry = {
        grant: { id, namespace, name },
        from: new Map(),
        to: new Map(),
      };
      grants.set(id, entry);
    }
    switch (metric.__name__) {
      case GatewayApiReferencegrantFromInfo.name: {
        if (!metric.from_kind || !metric.from_namespace) break;
        const from = {
          group: metric.from_group ?? '',
          kind: metric.from_kind,
          namespace: metric.from_namespace,
        };
        entry.from.set(`${from.namespace}/${from.kind}/${from.group}`, from);
        break;
      }
      case GatewayApiReferencegrantToInfo.name: {
        if (!metric.to_kind) break;
        const to: ReferenceGrantTo = {
          group: metric.to_group ?? '',
          kind: metric.to_kind,
          ...(metric.to_name ? { name: metric.to_name } : {}),
        };
        entry.to.set(`${to.kind}/${to.group}/${to.name ?? ''}`, to);
        break;
      }
      default:
        break;
    }
  }

  return [...grants.values()]
    .map(({ grant, from, to }) => ({
      ...grant,
      from: [...from.values()].sort((a, b) =>
        compare([a.namespace, a.kind, a.group], [b.namespace, b.kind, b.group]),
      ),
      // A named resource after the whole kind, which it is part of.
      to: [...to.values()].sort((a, b) =>
        compare(
          [a.kind, a.group, a.name ? '1' : '0', a.name ?? ''],
          [b.kind, b.group, b.name ? '1' : '0', b.name ?? ''],
        ),
      ),
    }))
    .sort((a, b) => compare([a.namespace, a.name], [b.namespace, b.name]));
}

/** The groups whose kinds read without one: the core and Gateway API. */
const WELL_KNOWN_GROUPS = new Set(['', 'gateway.networking.k8s.io']);

/** `HTTPRoute`, or `Backend (gateway.envoyproxy.io)` for another group. */
function kindLabel(kind: string, group: string): string {
  return WELL_KNOWN_GROUPS.has(group) ? kind : `${kind} (${group})`;
}

/** An entry as the table lists it, keyed by every field of it. */
export interface ReferenceGrantEntry {
  key: string;
  label: string;
}

/** `HTTPRoute in loki`. */
export function referenceGrantFromEntry(
  from: ReferenceGrantFrom,
): ReferenceGrantEntry {
  return {
    key: `${from.group}/${from.kind}/${from.namespace}`,
    label: `${kindLabel(from.kind, from.group)} in ${from.namespace}`,
  };
}

/** `Service dex`, or `any Service` when the grant names none. */
export function referenceGrantToEntry(
  to: ReferenceGrantTo,
): ReferenceGrantEntry {
  const kind = kindLabel(to.kind, to.group);
  return {
    key: `${to.group}/${to.kind}/${to.name ?? ''}`,
    label: to.name ? `${kind} ${to.name}` : `any ${kind}`,
  };
}

const GATEWAY_API_GROUP = 'gateway.networking.k8s.io';

/**
 * Whether the grant lets an HTTPRoute in `routeNamespace` reference the
 * backend, as Gateway API matches a backendRef against a ReferenceGrant: the
 * grant is in the backend's namespace, a `from` names HTTPRoute in the
 * route's namespace, and a `to` names the backend's kind, and its name or
 * none. The metric names no group for a backend: a Service is in the core
 * group, another kind is matched by kind alone.
 */
export function grantPermitsBackend(
  grant: ReferenceGrant,
  routeNamespace: string,
  backend: { kind: string; namespace: string; name: string },
): boolean {
  if (
    backend.namespace === routeNamespace ||
    grant.namespace !== backend.namespace
  ) {
    return false;
  }
  return (
    grant.from.some(
      from =>
        from.group === GATEWAY_API_GROUP &&
        from.kind === 'HTTPRoute' &&
        from.namespace === routeNamespace,
    ) &&
    grant.to.some(
      to =>
        to.kind === backend.kind &&
        (backend.kind !== 'Service' || to.group === '') &&
        (!to.name || to.name === backend.name),
    )
  );
}

/**
 * Whether the grant lets Gateways in `namespace` reference into its own, as a
 * Gateway does for a TLS certificate (a Secret) or a CA bundle (a ConfigMap)
 * in another namespace, the only kinds a Gateway references. Which ones a
 * Gateway references isn't exported, so this is what it may do.
 */
export function grantPermitsGateways(
  grant: ReferenceGrant,
  namespace: string,
): boolean {
  return (
    grant.namespace !== namespace &&
    grant.from.some(
      from =>
        from.group === GATEWAY_API_GROUP &&
        from.kind === 'Gateway' &&
        from.namespace === namespace,
    ) &&
    grant.to.some(
      to =>
        to.group === '' && (to.kind === 'Secret' || to.kind === 'ConfigMap'),
    )
  );
}
