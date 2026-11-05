import { MimirMetricSample } from '../../apis/mimir/types';
import {
  EnvoyGatewayBackendTrafficPolicyCreated,
  EnvoyGatewayBackendTrafficPolicyInfo,
  EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted,
  EnvoyGatewayBackendTrafficPolicyTargetInfo,
  EnvoyGatewayClientTrafficPolicyCreated,
  EnvoyGatewayClientTrafficPolicyInfo,
  EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted,
  EnvoyGatewayClientTrafficPolicyTargetInfo,
  EnvoyGatewayEnvoyExtensionPolicyCreated,
  EnvoyGatewayEnvoyExtensionPolicyInfo,
  EnvoyGatewayEnvoyExtensionPolicyStatusAncestorAccepted,
  EnvoyGatewayEnvoyExtensionPolicyTargetInfo,
  EnvoyGatewaySecurityPolicyCreated,
  EnvoyGatewaySecurityPolicyInfo,
  EnvoyGatewaySecurityPolicyStatusAncestorAccepted,
  EnvoyGatewaySecurityPolicyTargetInfo,
} from '@giantswarm/backstage-plugin-gs-common';
import { ConditionState, setWorst, toCondition } from './gatewayTopology';

export type PolicyKind =
  | 'SecurityPolicy'
  | 'BackendTrafficPolicy'
  | 'ClientTrafficPolicy'
  | 'EnvoyExtensionPolicy';

/** The metrics of each policy kind, in a fixed order. */
export const policyMetrics: {
  kind: PolicyKind;
  created: string;
  info: string;
  targetInfo: string;
  ancestorAccepted: string;
}[] = [
  {
    kind: 'SecurityPolicy',
    created: EnvoyGatewaySecurityPolicyCreated.name,
    info: EnvoyGatewaySecurityPolicyInfo.name,
    targetInfo: EnvoyGatewaySecurityPolicyTargetInfo.name,
    ancestorAccepted: EnvoyGatewaySecurityPolicyStatusAncestorAccepted.name,
  },
  {
    kind: 'BackendTrafficPolicy',
    created: EnvoyGatewayBackendTrafficPolicyCreated.name,
    info: EnvoyGatewayBackendTrafficPolicyInfo.name,
    targetInfo: EnvoyGatewayBackendTrafficPolicyTargetInfo.name,
    ancestorAccepted:
      EnvoyGatewayBackendTrafficPolicyStatusAncestorAccepted.name,
  },
  {
    kind: 'ClientTrafficPolicy',
    created: EnvoyGatewayClientTrafficPolicyCreated.name,
    info: EnvoyGatewayClientTrafficPolicyInfo.name,
    targetInfo: EnvoyGatewayClientTrafficPolicyTargetInfo.name,
    ancestorAccepted:
      EnvoyGatewayClientTrafficPolicyStatusAncestorAccepted.name,
  },
  {
    kind: 'EnvoyExtensionPolicy',
    created: EnvoyGatewayEnvoyExtensionPolicyCreated.name,
    info: EnvoyGatewayEnvoyExtensionPolicyInfo.name,
    targetInfo: EnvoyGatewayEnvoyExtensionPolicyTargetInfo.name,
    ancestorAccepted:
      EnvoyGatewayEnvoyExtensionPolicyStatusAncestorAccepted.name,
  },
];

const kindByMetricName = new Map<string, PolicyKind>(
  policyMetrics.flatMap(m => [
    [m.created, m.kind],
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
  /** Unique per policy: every field of the ancestor reference. */
  id: string;
  group?: string;
  kind?: string;
  namespace?: string;
  name: string;
  sectionName?: string;
  port?: string;
  accepted: ConditionState;
}

export interface GatewayPolicy {
  id: string;
  kind: PolicyKind;
  namespace: string;
  name: string;
  targets: PolicyTarget[];
  /**
   * False when a targets query failed, so an empty `targets` means unknown
   * rather than none.
   */
  targetsLoaded: boolean;
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
  /** One series per policy: the policy list. */
  created: MimirMetricSample[];
  /** Deprecated `spec.targetRef`. Undefined when the query failed. */
  info: MimirMetricSample[] | undefined;
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
 * Identifies an ancestor reference and orders ancestors by namespace and name
 * first. Every field is in it, so a refetch never reorders equal rows.
 */
function ancestorSortKey(ref: Omit<PolicyAncestor, 'id' | 'accepted'>) {
  return [
    ref.namespace ?? '',
    ref.name,
    ref.sectionName ?? '',
    ref.port ?? '',
    ref.kind ?? '',
    ref.group ?? '',
  ].join('/');
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
      policy: Omit<
        GatewayPolicy,
        'targets' | 'targetsLoaded' | 'ancestors' | 'status'
      >;
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

  for (const sample of inputs.created) ensure(sample);
  for (const sample of inputs.targetInfo ?? []) addTarget(sample, 'targetRefs');
  for (const sample of inputs.info ?? []) addTarget(sample, 'targetRef');

  for (const sample of inputs.ancestorAccepted ?? []) {
    const entry = ensure(sample);
    const name = sample.metric.ancestor_name;
    const condition = toCondition(sample);
    if (!entry || !name || !condition) continue;
    const fields = {
      group: sample.metric.ancestor_group || undefined,
      kind: sample.metric.ancestor_kind || undefined,
      namespace: sample.metric.ancestor_namespace || undefined,
      name,
      sectionName: sample.metric.ancestor_section_name || undefined,
      port: sample.metric.ancestor_port || undefined,
    };
    const key = ancestorSortKey(fields);
    entry.ancestorRefs.set(key, { id: key, ...fields });
    setWorst(entry.ancestors, key, condition);
  }

  return Array.from(policies.values())
    .map(({ policy, targets, ancestors, ancestorRefs }) => {
      const ancestorList = Array.from(ancestorRefs.entries())
        .map(([key, ref]) => ({ ...ref, accepted: ancestors.get(key)! }))
        .sort((a, b) => a.id.localeCompare(b.id));
      let status: ConditionState = { status: 'not-reported' };
      if (!statusExported) {
        status = {
          status: 'not-available',
          cause:
            inputs.ancestorAccepted === undefined ||
            inputs.targetInfo === undefined ||
            inputs.info === undefined
              ? 'load-failed'
              : 'not-exported',
        };
      }
      return {
        ...policy,
        // Every field in the sort, so a refetch never reorders equal rows.
        targets: Array.from(targets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, target]) => target),
        targetsLoaded:
          inputs.targetInfo !== undefined && inputs.info !== undefined,
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
