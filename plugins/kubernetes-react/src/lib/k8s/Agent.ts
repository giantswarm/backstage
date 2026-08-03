import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type AgentInterface = crds.kagent.v1alpha2.Agent;
type AgentCondition = NonNullable<
  NonNullable<AgentInterface['status']>['conditions']
>[number];

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
 * Reasons the controller uses for `Ready=True`: `DeploymentReady` for a
 * Deployment-backed agent, `WorkloadReady` for a sandbox workload.
 *
 * kagent's own REST API keys its `deploymentReady` flag on this reason set
 * rather than on `Ready=True` alone, so any other reason — notably
 * `Ready=Unknown` / `DeploymentNotFound`, which is what a missing Deployment
 * produces — counts as not ready. We match that deliberately, so this list and
 * kagent's UI agree on what "ready" means.
 */
const READY_REASONS: string[] = ['DeploymentReady', 'WorkloadReady'];

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
export function deriveAgentReadiness(json: AgentInterface): AgentReadiness {
  const conditions = json.status?.conditions;

  // The controller has not written a status at all yet.
  if (!conditions?.length) {
    return 'pending';
  }

  // The controller stamps `status.observedGeneration` on every status write,
  // including when reconciliation *fails* — so a spec it genuinely rejects
  // settles on `notAccepted` rather than sticking at `pending` forever.
  const { generation } = json.metadata ?? {};
  const observedGeneration = json.status?.observedGeneration;
  if (
    typeof generation === 'number' &&
    (typeof observedGeneration !== 'number' || observedGeneration < generation)
  ) {
    return 'pending';
  }

  if (
    findAgentCondition(json, AgentConditionType.Accepted)?.status !== 'True'
  ) {
    return 'notAccepted';
  }

  const ready = findAgentCondition(json, AgentConditionType.Ready);
  if (ready?.status !== 'True' || !READY_REASONS.includes(ready.reason)) {
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

  getConditions() {
    return this.jsonData.status?.conditions;
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
