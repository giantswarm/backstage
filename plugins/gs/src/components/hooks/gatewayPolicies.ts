import { MimirMetricSample } from '../../apis/mimir/types';
import {
  EnvoyGatewayBackendTrafficPolicyInfo,
  EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted,
  EnvoyGatewayBackendTrafficPolicyTargetInfo,
  EnvoyGatewayClientTrafficPolicyInfo,
  EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted,
  EnvoyGatewayClientTrafficPolicyTargetInfo,
  EnvoyGatewayEnvoyExtensionPolicyInfo,
  EnvoyGatewayEnvoyExtensionPolicyStatusAncestorAccepted,
  EnvoyGatewayEnvoyExtensionPolicyTargetInfo,
  EnvoyGatewaySecurityPolicyInfo,
  EnvoyGatewaySecurityPolicyStatusAncestorAccepted,
  EnvoyGatewaySecurityPolicyTargetInfo,
} from '../../apis/mimir/metrics';
import { ConditionState, setWorst, toCondition } from './gatewayTopology';

export type PolicyKind =
  | 'SecurityPolicy'
  | 'BackendTrafficPolicy'
  | 'ClientTrafficPolicy'
  | 'EnvoyExtensionPolicy';

/** The metrics of each policy kind, in a fixed order. */
export const policyMetrics: {
  kind: PolicyKind;
  info: string;
  targetInfo: string;
  ancestorAccepted: string;
}[] = [
  {
    kind: 'SecurityPolicy',
    info: EnvoyGatewaySecurityPolicyInfo.name,
    targetInfo: EnvoyGatewaySecurityPolicyTargetInfo.name,
    ancestorAccepted: EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name,
  },
  {
    kind: 'BackendTrafficPolicy',
    info: EnvoyGatewayBackendTrafficPolicyInfo.name,
    targetInfo: EnvoyGatewayBackendTrafficPolicyTargetInfo.name,
    ancestorAccepted:
      EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted.name,
  },
  {
    kind: 'ClientTrafficPolicy',
    info: EnvoyGatewayClientTrafficPolicyInfo.name,
    targetInfo: EnvoyGatewayClientTrafficPolicyTargetInfo.name,
    ancestorAccepted:
      EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted.name,
  },
  {
    kind: 'EnvoyExtensionPolicy',
    info: EnvoyGatewayEnvoyExtensionPolicyInfo.name,
    targetInfo: EnvoyGatewayEnvoyExtensionPolicyTargetInfo.name,
    ancestorAccepted:
      EnvoyGatewayEnvoyExtensionPolicyStatusAncestorAccepted.name,
  },
];

const kindByMetricName = new Map<string, PolicyKind>(
  policyMetrics.flatMap(m => [
    [m.info, m.kind],
    [m.targetInfo, m.kind],
    [m.ancestorAccepted, m.kind],
  ]),
);

export interface PolicyTarget {
  kind: string;
  name: string;
  sectionName?: string;
  /** `targetRef` is the deprecated single-target field. */
  source: 'targetRefs' | 'targetRef';
}

export interface PolicyAncestor {
  kind?: string;
  namespace?: string;
  name: string;
  sectionName?: string;
  accepted: ConditionState;
}

export interface GatewayPolicy {
  id: string;
  kind: PolicyKind;
  namespace: string;
  name: string;
  targets: PolicyTarget[];
  ancestors: PolicyAncestor[];
  /**
   * Only meaningful without ancestors: `not-reported` when the cluster exports
   * policy status but this policy has none; `not-available` when the cluster
   * can't export policy status. Envoy Gateway writes no status when the target
   * doesn't exist, isn't managed by it, or before reconciling.
   */
  status: ConditionState;
}

export interface GatewayPoliciesInputs {
  info: MimirMetricSample[];
  /** Undefined when the query failed. */
  targetInfo: MimirMetricSample[] | undefined;
  /** Undefined when the query failed. */
  ancestorAccepted: MimirMetricSample[] | undefined;
}

function kindOf(sample: MimirMetricSample): PolicyKind | undefined {
  return kindByMetricName.get(sample.metric.__name__ ?? '');
}

function policyKey(kind: PolicyKind, namespace: string, name: string) {
  return `${kind}/${namespace}/${name}`;
}

/**
 * Joins the Envoy Gateway policy metrics of one cluster into policies with
 * their targets and the Accepted condition per ancestor (a Gateway or
 * ListenerSet).
 */
export function buildGatewayPolicies(
  inputs: GatewayPoliciesInputs,
): GatewayPolicy[] {
  // Policy status can only be judged when the cluster exports the newer
  // policy metrics at all. A cluster whose policies all use the deprecated
  // `targetRef` and resolved no ancestor can't be told apart from an older
  // bundle, and is reported as not available.
  const statusExported =
    inputs.ancestorAccepted !== undefined &&
    ((inputs.targetInfo?.length ?? 0) > 0 ||
      inputs.ancestorAccepted.length > 0);

  const policies = new Map<
    string,
    {
      policy: Omit<GatewayPolicy, 'targets' | 'ancestors' | 'status'>;
      targets: Map<string, PolicyTarget>;
      ancestors: Map<string, ConditionState>;
      ancestorRefs: Map<string, Omit<PolicyAncestor, 'accepted'>>;
    }
  >();
  const ensure = (sample: MimirMetricSample) => {
    const kind = kindOf(sample);
    const { namespace, name } = sample.metric;
    if (!kind || !namespace || !name) return undefined;
    const key = policyKey(kind, namespace, name);
    let entry = policies.get(key);
    if (!entry) {
      entry = {
        policy: { id: key, kind, namespace, name },
        targets: new Map(),
        ancestors: new Map(),
        ancestorRefs: new Map(),
      };
      policies.set(key, entry);
    }
    return entry;
  };

  const addTarget = (
    sample: MimirMetricSample,
    source: PolicyTarget['source'],
  ) => {
    const entry = ensure(sample);
    const kind = sample.metric.target_kind;
    const name = sample.metric.target_name;
    if (!entry || !kind || !name) return;
    const sectionName = sample.metric.target_section_name || undefined;
    const key = `${kind}/${name}/${sectionName ?? ''}`;
    if (!entry.targets.has(key)) {
      entry.targets.set(key, { kind, name, sectionName, source });
    }
  };

  for (const sample of inputs.targetInfo ?? []) addTarget(sample, 'targetRefs');
  for (const sample of inputs.info) addTarget(sample, 'targetRef');

  for (const sample of inputs.ancestorAccepted ?? []) {
    const entry = ensure(sample);
    const name = sample.metric.ancestor_name;
    const condition = toCondition(sample);
    if (!entry || !name || !condition) continue;
    const ref = {
      kind: sample.metric.ancestor_kind || undefined,
      namespace: sample.metric.ancestor_namespace || undefined,
      name,
      sectionName: sample.metric.ancestor_section_name || undefined,
    };
    const key = [
      sample.metric.ancestor_group ?? '',
      ref.kind,
      ref.namespace,
      ref.name,
      ref.sectionName,
      sample.metric.ancestor_port ?? '',
    ].join('/');
    entry.ancestorRefs.set(key, ref);
    setWorst(entry.ancestors, key, condition);
  }

  return Array.from(policies.values())
    .map(({ policy, targets, ancestors, ancestorRefs }) => {
      const ancestorList = Array.from(ancestorRefs.entries())
        .map(([key, ref]) => ({ ...ref, accepted: ancestors.get(key)! }))
        .sort((a, b) =>
          `${a.namespace}/${a.name}/${a.sectionName ?? ''}`.localeCompare(
            `${b.namespace}/${b.name}/${b.sectionName ?? ''}`,
          ),
        );
      const status: ConditionState = statusExported
        ? { status: 'not-reported' }
        : { status: 'not-available' };
      return {
        ...policy,
        targets: Array.from(targets.values()).sort((a, b) =>
          `${a.kind}/${a.name}`.localeCompare(`${b.kind}/${b.name}`),
        ),
        ancestors: ancestorList,
        status,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** True when an ancestor rejected the policy. */
export function isPolicyBroken(policy: GatewayPolicy): boolean {
  return policy.ancestors.some(a => a.accepted.status === 'false');
}

/**
 * True when the cluster exports policy status but the policy has none: its
 * target doesn't exist, isn't managed by Envoy Gateway, or it wasn't
 * reconciled yet.
 */
export function isPolicyUnattached(policy: GatewayPolicy): boolean {
  return (
    policy.ancestors.length === 0 && policy.status.status === 'not-reported'
  );
}
