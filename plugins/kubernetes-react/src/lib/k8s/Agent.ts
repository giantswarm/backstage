import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type AgentInterface = crds.kagent.v1alpha2.Agent;
type AgentCondition = NonNullable<
  NonNullable<AgentInterface['status']>['conditions']
>[number];

/**
 * One entry of `spec.declarative.tools` — a reference to something the agent may
 * call. The CRD models the list as a union of fixed-length tuples (its
 * `maxItems: 20`), so it is indexed here to recover the element type.
 */
export type AgentTool = NonNullable<
  NonNullable<NonNullable<AgentInterface['spec']>['declarative']>['tools']
>[number];

/** An `McpServer` tool reference: a `RemoteMCPServer`/`MCPServer` and, optionally, which of its tools to expose. */
export type AgentMcpServerRef = NonNullable<AgentTool['mcpServer']>;

/** An `Agent` tool reference: another agent invoked as a tool over A2A. */
export type AgentToolAgentRef = NonNullable<AgentTool['agent']>;

/**
 * Condition types the kagent controller sets on an Agent. `Accepted` reports
 * whether the spec reconciled, `Ready` whether the backing workload is up, and
 * `UnsupportedFeatures` is a soft warning that does not block reconciliation
 * (the controller removes the condition entirely once the warning clears).
 */
export const AgentConditionType = {
  Accepted: 'Accepted',
  Ready: 'Ready',
  UnsupportedFeatures: 'UnsupportedFeatures',
} as const;

/**
 * Note on readiness and condition *reasons*.
 *
 * kagent's own REST API gates its `deploymentReady` flag on both
 * `Ready=True` *and* the reason being one of `DeploymentReady` (a
 * Deployment-backed agent) or `WorkloadReady` (a sandbox workload). We
 * deliberately do **not** copy that allowlist, and key on the condition's status
 * alone.
 *
 * The allowlist's apparent purpose is to reject a missing Deployment, which the
 * controller reports as `Ready=Unknown` / `DeploymentNotFound` — but that is
 * already excluded by the status check, so the allowlist adds nothing for the
 * case that motivates it. What it does add is a failure mode on version skew: a
 * kagent that introduces a third ready reason (say `StatefulSetReady`) would make
 * a healthy fleet render as "not ready", with a tooltip showing that condition's
 * own message ("Deployment is ready") and thus contradicting the label.
 *
 * Trusting `Ready=True` fails in the opposite direction — a kagent that sets
 * `Ready=True` to mean something other than ready — which would be a bug
 * upstream rather than an expected evolution.
 */

/**
 * Readiness of an agent, derived from its status conditions.
 *
 * - `ready` — accepted, and the backing workload has an available replica.
 * - `notReady` — accepted, but the workload is not up.
 * - `notAccepted` — the controller rejected the spec.
 * - `pending` — not reconciled yet, or reconciled against an older generation,
 *   so the conditions do not describe the current spec. Distinct from
 *   `notReady`: it means "not known yet", not "broken".
 */
export type AgentReadiness = 'ready' | 'notReady' | 'notAccepted' | 'pending';

function findAgentCondition(
  json: AgentInterface,
  type: string,
): AgentCondition | undefined {
  return json.status?.conditions?.find(condition => condition.type === type);
}

/**
 * Derive an agent's readiness from its raw status conditions.
 *
 * Exported as a free function (rather than only as an {@link Agent} method) so
 * callers holding raw list data — e.g. a react-query `refetchInterval`
 * callback, which sees `KubeObjectInterface[]` and not hydrated instances — can
 * reuse the exact same derivation instead of reimplementing it.
 */
/**
 * Whether the reported status describes an *older* spec than the one currently
 * stored — the controller has seen the object but not yet caught up.
 *
 * Staleness is only claimed when observedGeneration is actually present and
 * behind. The controller stamps it on every status write (including when
 * reconciliation *fails*, so a rejected spec settles on `notAccepted` rather
 * than sticking at `pending`), but the CRD marks it optional — whereas
 * `metadata.generation` is always set by the apiserver. Treating "absent" as
 * "stale" would therefore fail closed: against a build that writes conditions
 * but not `status.observedGeneration`, *every* agent on that installation would
 * read `pending`, hiding healthy and broken agents behind the same
 * explanation-free label. Absent means "cannot tell", so this reports `false`
 * and callers report what the conditions actually say.
 */
export function isAgentStatusStale(json: AgentInterface): boolean {
  const { generation } = json.metadata ?? {};
  const observedGeneration = json.status?.observedGeneration;

  return (
    typeof generation === 'number' &&
    typeof observedGeneration === 'number' &&
    observedGeneration < generation
  );
}

export function deriveAgentReadiness(json: AgentInterface): AgentReadiness {
  const conditions = json.status?.conditions;

  // The controller has not written a status at all yet.
  if (!conditions?.length) {
    return 'pending';
  }

  if (isAgentStatusStale(json)) {
    return 'pending';
  }

  if (
    findAgentCondition(json, AgentConditionType.Accepted)?.status !== 'True'
  ) {
    return 'notAccepted';
  }

  // Status only, not reason — see the note above READY_REASONS' removal.
  if (findAgentCondition(json, AgentConditionType.Ready)?.status !== 'True') {
    return 'notReady';
  }

  return 'ready';
}

/**
 * Whether an agent has not settled into a healthy state, and so is worth
 * re-checking sooner than the rest of the fleet. Mirrors kagent's own
 * `!accepted || !deploymentReady`, plus our `pending`.
 */
export function isAgentTransitional(readiness: AgentReadiness): boolean {
  return readiness !== 'ready';
}

/**
 * When the agent's status last changed, as epoch milliseconds: the most recent
 * `lastTransitionTime` across its conditions, falling back to the creation
 * timestamp for an agent the controller has not written a status for yet.
 * `undefined` when neither is parseable.
 *
 * "Most recent across all conditions" is deliberately an *activity* signal, not
 * a per-condition age: while the controller is actively flipping an agent's
 * conditions it keeps moving, and once the agent is durably stuck it stops. That
 * is what lets a caller back off from polling an agent that is broken rather
 * than still converging.
 */
export function getAgentStatusChangedAt(
  json: AgentInterface,
): number | undefined {
  const transitionTimes = (json.status?.conditions ?? [])
    .map(condition => Date.parse(condition.lastTransitionTime))
    .filter(time => !Number.isNaN(time));

  if (transitionTimes.length > 0) {
    return Math.max(...transitionTimes);
  }

  const createdAt = Date.parse(json.metadata?.creationTimestamp ?? '');

  return Number.isNaN(createdAt) ? undefined : createdAt;
}

/**
 * kagent Agent — a reusable agent definition, deployed via the
 * `general-purpose-agent` Helm chart. The capability surface (model, system
 * prompt, skills) lives under `spec.declarative` for declarative agents.
 */
export class Agent extends KubeObject<AgentInterface> {
  static readonly supportedVersions = ['v1alpha2'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'Agent' as const;
  static readonly plural = 'agents';

  /**
   * Friendly name for lists. Prefers the `ui.giantswarm.io/display-name`
   * annotation when present, otherwise falls back to the resource name. Mirrors
   * `ModelConfig.getDisplayName()`.
   */
  getDisplayName() {
    return (
      this.getAnnotations()?.['ui.giantswarm.io/display-name'] ?? this.getName()
    );
  }

  /** `Declarative` (chart-configured) or `BYO` (bring-your-own container). */
  getType() {
    return this.jsonData.spec?.type;
  }

  getDescription() {
    return this.jsonData.spec?.description;
  }

  /** Name of the referenced ModelConfig (declarative agents only). */
  getModelConfigName() {
    return this.jsonData.spec?.declarative?.modelConfig;
  }

  getSystemMessage() {
    return this.jsonData.spec?.declarative?.systemMessage;
  }

  /**
   * Git repositories the agent pulls skills from, each mounted under `/skills`.
   * (The v1alpha2 CRD models skills as `spec.skills.gitRefs`.)
   */
  getSkillRefs() {
    return this.jsonData.spec?.skills?.gitRefs ?? [];
  }

  /** Number of skills mounted by the agent. */
  getSkillCount() {
    return this.getSkillRefs().length;
  }

  /**
   * Everything the agent may call: MCP servers and other agents. Spread into a
   * plain array because the CRD types the field as a union of tuples.
   */
  getTools(): AgentTool[] {
    return [...(this.jsonData.spec?.declarative?.tools ?? [])];
  }

  /**
   * The MCP servers the agent draws tools from.
   *
   * Discriminated on the presence of `mcpServer` rather than on `type`, which is
   * optional in the CRD — a hand-written or chart-rendered tool entry commonly
   * omits it and lets the controller infer the kind.
   */
  getMcpServerRefs(): AgentMcpServerRef[] {
    return this.getTools()
      .map(tool => tool.mcpServer)
      .filter((ref): ref is AgentMcpServerRef => Boolean(ref));
  }

  /** Other agents this agent invokes as tools (A2A). */
  getAgentRefs(): AgentToolAgentRef[] {
    return this.getTools()
      .map(tool => tool.agent)
      .filter((ref): ref is AgentToolAgentRef => Boolean(ref));
  }

  getConditions() {
    return this.jsonData.status?.conditions;
  }

  /** Spec revision currently stored, bumped by the apiserver on every change. */
  getGeneration(): number | undefined {
    return this.jsonData.metadata?.generation;
  }

  /** Spec revision the reported status was computed from, when the controller records it. */
  getObservedGeneration(): number | undefined {
    return this.jsonData.status?.observedGeneration;
  }

  /**
   * Whether the reported status is known to describe an older spec. See
   * {@link isAgentStatusStale} — notably, this is `false` when the controller
   * records no `observedGeneration` at all.
   */
  isStale(): boolean {
    return isAgentStatusStale(this.jsonData);
  }

  getCondition(type: string) {
    return findAgentCondition(this.jsonData, type);
  }

  /** Readiness derived from the status conditions. See {@link AgentReadiness}. */
  getReadiness(): AgentReadiness {
    return deriveAgentReadiness(this.jsonData);
  }

  /**
   * Human-readable detail for the current readiness, taken from whichever
   * condition determined it: the reconcile error for `notAccepted`, and the
   * controller's "N/M pods are ready" (or the Deployment lookup error) for
   * `notReady`. `undefined` when the agent is ready, or when the state needs no
   * explanation.
   */
  getReadinessMessage(): string | undefined {
    switch (this.getReadiness()) {
      case 'notAccepted':
        return (
          this.getCondition(AgentConditionType.Accepted)?.message || undefined
        );
      case 'notReady':
        return (
          this.getCondition(AgentConditionType.Ready)?.message || undefined
        );
      default:
        return undefined;
    }
  }

  /**
   * Soft warning from the controller when the spec uses features the chosen
   * runtime does not support. Independent of readiness — an agent can be fully
   * ready and still carry this — so it is reported separately rather than
   * folded into {@link getReadiness}.
   */
  getUnsupportedFeaturesWarning(): string | undefined {
    const condition = this.getCondition(AgentConditionType.UnsupportedFeatures);

    return condition?.status === 'True'
      ? condition.message || undefined
      : undefined;
  }
}
