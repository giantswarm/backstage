import { KubeObject } from './KubeObject';
import {
  KAGENT_API_GROUP,
  type AgentCondition,
  type AgentInterface,
  type AgentMcpBinding,
  type AgentSubAgentBinding,
  type AgentTemplateSpec,
  type AgentToolBinding,
} from './kagentApi';

export type {
  AgentCondition,
  AgentInterface,
  AgentMcpBinding,
  AgentStatus,
  AgentSubAgentBinding,
  AgentTemplateInterface,
  AgentTemplateSpec,
  AgentToolBinding,
} from './kagentApi';

type AgentTemplateSkill = NonNullable<AgentTemplateSpec['skills']>[number];

/**
 * A skill mounted into the agent, flattened for display: where it comes from and
 * the immutable pin it is fixed to. Every skill source on API v2 is pinned —
 * a git commit, an OCI digest or an S3 object version — so an agent's behaviour
 * never changes under its author because a repository moved.
 */
export type AgentSkill = {
  name: string;
  source: 'git' | 'oci' | 'bucket';
  /** The git repository URL, the OCI reference without its digest, or the bucket object URL. */
  url: string;
  /** Subdirectory within the source, when the skill is not at its root. */
  path?: string;
  /** The full git commit, the `sha256:…` digest, or the S3 version id. */
  pin: string;
};

const DISPLAY_NAME_ANNOTATION = 'ui.giantswarm.io/display-name';
const ICON_URL_ANNOTATION = 'ui.giantswarm.io/icon-url';

/**
 * Condition types the controller writes on an Agent: `Accepted` (the Harness
 * runs this kind of template), `ResolvedRefs` (the model config, the MCP
 * servers, the sub-agents and the prompt sources resolve), `Compatible` (the
 * resolved configuration fits the Harness) and `Ready` (the current revision
 * is compiled and its golden snapshot exists). Compile downgrades are
 * `status.warnings`, not a condition. Every condition is positive-polarity.
 */
export const AgentConditionType = {
  Accepted: 'Accepted',
  ResolvedRefs: 'ResolvedRefs',
  Compatible: 'Compatible',
  Ready: 'Ready',
} as const;

/**
 * The order the controller evaluates the conditions in. A failing stage marks
 * every later one `False` with the reason `Blocked`, so the first failure in
 * this order that is not `Blocked` is the root cause.
 */
export const AGENT_CONDITION_STAGE_ORDER: readonly string[] = [
  AgentConditionType.Accepted,
  AgentConditionType.ResolvedRefs,
  AgentConditionType.Compatible,
  AgentConditionType.Ready,
];

const BLOCKED_REASON = 'Blocked';

/**
 * Which part of the agent a failure is about: the model, the tools (an MCP
 * server or a sub-agent), the system prompt, or the platform (something the
 * agent's author cannot fix).
 */
export type AgentFailureField = 'model' | 'tools' | 'systemPrompt' | 'platform';

/** The condition that makes an agent `failed`, and what it is about. */
export type AgentFailure = {
  condition: string;
  message?: string;
  /** `undefined` when the message names nothing this page can point to. */
  field?: AgentFailureField;
};

/**
 * The part of the agent a controller message is about, read from the prefixes
 * kagent's compiler writes (`resolve ModelConfig "x": not found`, `resolve
 * RemoteMCPServer "x": …`, `WorkerPool "x" not found`).
 */
export function failureFieldOf(
  message: string | undefined,
): AgentFailureField | undefined {
  if (!message) {
    return undefined;
  }
  // Only the agent's own model: a memory ModelConfig is not on the page, and
  // marking the Model row for it would point at the wrong ModelConfig.
  if (/^resolve ModelConfig\b/.test(message)) {
    return 'model';
  }
  if (/^resolve (RemoteMCPServer|MCPServer|AgentTemplate)\b/.test(message)) {
    return 'tools';
  }
  if (/^resolve (systemPromptFrom|prompt sources?)\b/.test(message)) {
    return 'systemPrompt';
  }
  if (/^(resolve )?(Harness|WorkerPool) "[^"]*" not found/.test(message)) {
    return 'platform';
  }
  return undefined;
}

/**
 * Readiness of an agent, derived from `status.conditions`.
 *
 * - `ready` — `Ready=True`: sessions can start.
 * - `failed` — `Accepted`, `ResolvedRefs` or `Compatible` is `False`: a
 *   reference did not resolve or the configuration does not fit the Harness.
 * - `notReady` — accepted, but the revision is still compiling (`Ready` is not
 *   `True` yet).
 * - `pending` — not reconciled yet, or reconciled against an older generation,
 *   so the status does not describe the current spec. Distinct from
 *   `notReady`: it means "not known yet", not "broken".
 */
export type AgentReadiness = 'ready' | 'notReady' | 'failed' | 'pending';

function conditionsOf(json: AgentInterface): AgentCondition[] {
  return [...(json.status?.conditions ?? [])];
}

function findCondition(
  json: AgentInterface,
  type: string,
): AgentCondition | undefined {
  return conditionsOf(json).find(condition => condition.type === type);
}

function conditionStatus(
  json: AgentInterface,
  type: string,
): string | undefined {
  return findCondition(json, type)?.status;
}

/**
 * Whether the reported status describes an *older* spec than the one currently
 * stored — the controller has seen the object but not yet caught up.
 *
 * Staleness is only claimed when observedGeneration is actually present and
 * behind. The controller stamps it on every status write, but the CRD marks it
 * optional — whereas `metadata.generation` is always set by the apiserver.
 * Treating "absent" as "stale" would fail closed: against a build that writes
 * conditions but not `status.observedGeneration`, *every* agent on that
 * installation would read `pending`, hiding healthy and broken agents behind the
 * same explanation-free label. Absent means "cannot tell", so this reports
 * `false` and callers report what the conditions actually say.
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

/**
 * Derive an agent's readiness from its raw status.
 *
 * Exported as a free function (rather than only as an {@link Agent} method) so
 * callers holding raw list data — e.g. a react-query `refetchInterval`
 * callback, which sees `KubeObjectInterface[]` and not hydrated instances — can
 * reuse the exact same derivation instead of reimplementing it.
 */
export function deriveAgentReadiness(json: AgentInterface): AgentReadiness {
  if (conditionsOf(json).length === 0 || isAgentStatusStale(json)) {
    return 'pending';
  }
  if (conditionStatus(json, AgentConditionType.Ready) === 'True') {
    return 'ready';
  }
  if (
    conditionStatus(json, AgentConditionType.Accepted) === 'False' ||
    conditionStatus(json, AgentConditionType.ResolvedRefs) === 'False' ||
    conditionStatus(json, AgentConditionType.Compatible) === 'False'
  ) {
    return 'failed';
  }
  if (conditionStatus(json, AgentConditionType.Accepted) === 'True') {
    // Ready is not True here, so the revision is still being prepared —
    // whether or not `desiredRevision` already differs from the last success.
    return 'notReady';
  }
  return 'pending';
}

/**
 * Whether an agent has not settled into a healthy state, and so is worth
 * re-checking sooner than the rest of the fleet.
 */
export function isAgentTransitional(readiness: AgentReadiness): boolean {
  return readiness !== 'ready';
}

/**
 * When the agent's status last changed, as epoch milliseconds: the most recent
 * `lastTransitionTime` across its conditions, falling back to the creation
 * timestamp for an agent the controller has not reported on yet. `undefined`
 * when neither is parseable.
 *
 * "Most recent across all conditions" is deliberately an *activity* signal, not
 * a per-condition age: while the controller is actively flipping conditions it
 * keeps moving, and once the agent is durably stuck it stops. That is what lets
 * a caller back off from polling an agent that is broken rather than still
 * converging.
 */
export function getAgentStatusChangedAt(
  json: AgentInterface,
): number | undefined {
  const transitionTimes = conditionsOf(json)
    .map(condition => Date.parse(condition.lastTransitionTime))
    .filter(time => !Number.isNaN(time));

  if (transitionTimes.length > 0) {
    return Math.max(...transitionTimes);
  }

  const createdAt = Date.parse(json.metadata?.creationTimestamp ?? '');

  return Number.isNaN(createdAt) ? undefined : createdAt;
}

/** The `<reference>@sha256:<digest>` an OCI skill source is, split for display. */
function splitOciReference(reference: string): { url: string; pin: string } {
  const at = reference.lastIndexOf('@');
  return at === -1
    ? { url: reference, pin: '' }
    : { url: reference.slice(0, at), pin: reference.slice(at + 1) };
}

function toAgentSkill(skill: AgentTemplateSkill): AgentSkill {
  const { source } = skill;
  const path = source.path || undefined;
  if (source.git) {
    return {
      name: skill.name,
      source: 'git',
      url: source.git.url,
      pin: source.git.commit,
      ...(path && { path }),
    };
  }
  if (source.oci) {
    return {
      name: skill.name,
      source: 'oci',
      ...splitOciReference(source.oci),
      ...(path && { path }),
    };
  }
  const s3 = source.bucket?.s3;
  return {
    name: skill.name,
    source: 'bucket',
    url: s3 ? `${s3.endpoint}/${s3.bucket}/${s3.key}` : '',
    pin: s3?.versionId ?? '',
    ...(path && { path }),
  };
}

/**
 * kagent Agent — the agent unit on kagent API v2: a template (model, system
 * prompt, tool bindings, commit-pinned skills), inline under `spec.template`
 * or named by `spec.templateRef`, paired with the Harness that runs it, named
 * by `spec.harnessRef` or inline under `spec.harness`. People start sessions
 * of it; there is no per-agent Deployment or runtime. Rendered by the Generic
 * chart's release, which is what the Flux provenance labels on the object
 * point back to; the chart renders the template inline and the Harness by
 * name, so the template readers below answer for every agent the portal
 * creates.
 */
export class Agent extends KubeObject<AgentInterface> {
  static readonly supportedVersions = ['v1alpha3'] as const;
  static readonly group = KAGENT_API_GROUP;
  static readonly kind = 'Agent' as const;
  static readonly plural = 'agents';

  /**
   * Friendly name for lists. Prefers the `ui.giantswarm.io/display-name`
   * annotation when present, otherwise falls back to the resource name. Mirrors
   * `ModelConfig.getDisplayName()`.
   */
  getDisplayName() {
    return this.getAnnotations()?.[DISPLAY_NAME_ANNOTATION] ?? this.getName();
  }

  /** The `ui.giantswarm.io/icon-url` annotation, when the chart set one. */
  getIconUrl(): string | undefined {
    return this.getAnnotations()?.[ICON_URL_ANNOTATION];
  }

  /**
   * The inline template. `undefined` when the agent names an `AgentTemplate`
   * instead, in which case every template reader below answers `undefined`
   * or empty and {@link getTemplateRef} names where to look.
   */
  getTemplate(): AgentTemplateSpec | undefined {
    return this.jsonData.spec?.template;
  }

  /** The same-namespace `AgentTemplate` the agent runs, when not inline. */
  getTemplateRef(): string | undefined {
    return this.jsonData.spec?.templateRef?.name;
  }

  /**
   * The same-namespace Harness the agent runs on. `undefined` when the
   * Harness is inline under `spec.harness`, which the chart never renders.
   */
  getHarnessName(): string | undefined {
    return this.jsonData.spec?.harnessRef?.name;
  }

  getDescription() {
    return this.getTemplate()?.description;
  }

  /** Name of the referenced ModelConfig, always in the agent's own namespace. */
  getModelConfigName() {
    return this.getTemplate()?.modelConfig?.name;
  }

  /** The inline system prompt. A prompt sourced from a ConfigMap reads as undefined. */
  getSystemMessage() {
    return this.getTemplate()?.systemPrompt;
  }

  /** The ConfigMap key the system prompt is read from, when it is not inline. */
  getSystemMessageSource() {
    return this.getTemplate()?.systemPromptFrom;
  }

  /** The skills mounted into the agent, each with its pin. */
  getSkills(): AgentSkill[] {
    return (this.getTemplate()?.skills ?? []).map(toAgentSkill);
  }

  /** Number of skills mounted by the agent. */
  getSkillCount() {
    return this.getTemplate()?.skills?.length ?? 0;
  }

  /** Every `tools[]` binding: MCP servers and sub-agents. */
  getToolBindings(): AgentToolBinding[] {
    return [...(this.getTemplate()?.tools ?? [])];
  }

  /** The MCP servers the agent draws tools from, all in its own namespace. */
  getMcpBindings(): AgentMcpBinding[] {
    return this.getToolBindings()
      .map(binding => binding.mcp)
      .filter((binding): binding is AgentMcpBinding => Boolean(binding));
  }

  /** The templates this agent runs as sub-agents, compiled into its own runtime. */
  getSubAgentBindings(): AgentSubAgentBinding[] {
    return this.getToolBindings()
      .map(binding => binding.subAgent)
      .filter((ref): ref is AgentSubAgentBinding => Boolean(ref));
  }

  /** The controller's conditions on the agent, in the order it wrote them. */
  getConditions(): AgentCondition[] {
    return conditionsOf(this.jsonData);
  }

  getCondition(type: string) {
    return findCondition(this.jsonData, type);
  }

  /** Spec revision currently stored, bumped by the apiserver on every change. */
  getGeneration(): number | undefined {
    return this.jsonData.metadata?.generation;
  }

  /** Spec revision the reported status was computed from, when the controller records it. */
  getObservedGeneration(): number | undefined {
    return this.jsonData.status?.observedGeneration;
  }

  /** The revision compiled from the current generation. */
  getDesiredRevision(): string | undefined {
    return this.jsonData.status?.desiredRevision;
  }

  /** The last revision that became ready. */
  getLatestSuccessfulRevision(): string | undefined {
    return this.jsonData.status?.latestSuccessfulRevision;
  }

  /**
   * Whether the reported status is known to describe an older spec. See
   * {@link isAgentStatusStale} — notably, this is `false` when the controller
   * records no `observedGeneration` at all.
   */
  isStale(): boolean {
    return isAgentStatusStale(this.jsonData);
  }

  /** Readiness derived from the conditions. See {@link AgentReadiness}. */
  getReadiness(): AgentReadiness {
    return deriveAgentReadiness(this.jsonData);
  }

  /**
   * Human-readable detail for the current readiness, taken from whichever
   * condition determined it. `undefined` when the agent is ready, or when the
   * state needs no explanation.
   */
  getReadinessMessage(): string | undefined {
    switch (this.getReadiness()) {
      // A ResolvedRefs=False ahead of Compatible: a Compatible=False that only
      // reads "blocked by ResolvedRefs" defers to the reference that did not
      // resolve. Only False, though -- an Unknown one explains nothing, and the
      // real rejection is Compatible's.
      case 'failed': {
        const resolvedRefs = this.getCondition(AgentConditionType.ResolvedRefs);
        return (
          this.firstFailingMessage([AgentConditionType.Accepted]) ??
          (resolvedRefs?.status === 'False'
            ? resolvedRefs.message || undefined
            : undefined) ??
          this.firstFailingMessage([AgentConditionType.Compatible])
        );
      }
      case 'notReady':
        return this.firstFailingMessage([
          AgentConditionType.ResolvedRefs,
          AgentConditionType.Compatible,
          AgentConditionType.Ready,
        ]);
      default:
        return undefined;
    }
  }

  /**
   * The root cause of a `failed` agent: the first `False` condition in
   * {@link AGENT_CONDITION_STAGE_ORDER} that is not merely `Blocked` by an
   * earlier one. `undefined` unless the agent is `failed`.
   */
  getFailure(): AgentFailure | undefined {
    if (this.getReadiness() !== 'failed') {
      return undefined;
    }
    const failing = AGENT_CONDITION_STAGE_ORDER.map(type =>
      this.getCondition(type),
    ).filter(condition => condition?.status === 'False');
    const rootCause =
      failing.find(condition => condition?.reason !== BLOCKED_REASON) ??
      failing[0];
    if (!rootCause) {
      return undefined;
    }
    const message = rootCause.message || undefined;
    return {
      condition: rootCause.type,
      message,
      field: failureFieldOf(message),
    };
  }

  /**
   * Compile downgrades the Harness reports — features it could not honour.
   * Independent of readiness: a ready agent can carry them, so they are
   * reported separately rather than folded into {@link getReadiness}.
   */
  getHarnessWarnings(): string[] {
    return [...(this.jsonData.status?.warnings ?? [])];
  }

  private firstFailingMessage(types: string[]): string | undefined {
    return (
      types
        .map(type => this.getCondition(type))
        .find(condition => condition && condition.status !== 'True')?.message ||
      undefined
    );
  }
}
