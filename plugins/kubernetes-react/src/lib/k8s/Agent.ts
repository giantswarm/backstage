import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

/**
 * `kagent.dev/v1alpha3 AgentTemplate`, the agent unit on kagent API v2.
 *
 * An agent is a template — model, system prompt, tool bindings, commit-pinned
 * skills — that a **Harness** admits by label selector and compiles into a
 * revision; people instantiate it per conversation as an `AgentInstance`. There
 * is no per-agent Deployment, runtime or `spec.type` any more: a bring-your-own
 * runtime is a Harness, not an agent. The class keeps the name `Agent` so the
 * Agent Platform pages read as before; the JSON underneath is the template.
 */
export type AgentTemplateInterface = crds.kagent.v1alpha3.AgentTemplate;

type AgentInterface = AgentTemplateInterface;

/** One `spec.tools[]` binding: exactly one of `mcp` (a server) or `agent` (another template). */
export type AgentToolBinding = NonNullable<
  NonNullable<AgentInterface['spec']>['tools']
>[number];

/**
 * An MCP binding: a same-namespace `RemoteMCPServer` (`server.kind`/`name`),
 * optionally narrowed to some of its tools, optionally requiring approval before
 * a call.
 */
export type AgentMcpBinding = NonNullable<AgentToolBinding['mcp']>;

/** Another template invoked as a tool over A2A. */
export type AgentToolAgentRef = NonNullable<AgentToolBinding['agent']>;

/** One `status.harnesses[]` entry: what one admitting Harness reports for the template. */
export type AgentHarnessStatus = NonNullable<
  NonNullable<AgentInterface['status']>['harnesses']
>[number];

/**
 * A condition inside a harness entry. The CRD types the list as a union of
 * fixed-length tuples (its `maxItems`), so it is indexed here to recover the
 * element type.
 */
export type AgentHarnessCondition = NonNullable<
  AgentHarnessStatus['conditions']
>[number];

type AgentTemplateSkill = NonNullable<
  NonNullable<AgentInterface['spec']>['skills']
>[number];

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

/**
 * The label a template carries to be admitted by the platform Harness; its value
 * is the Harness name. The Generic chart sets it on every agent it renders; a
 * template without it is admitted by nothing and never becomes ready.
 */
export const HARNESS_LABEL = 'agent-platform.giantswarm.io/harness';

const DISPLAY_NAME_ANNOTATION = 'ui.giantswarm.io/display-name';
const ICON_URL_ANNOTATION = 'ui.giantswarm.io/icon-url';

/**
 * Condition types a Harness sets in its entry of `status.harnesses[]`:
 * `Accepted` (the Harness admits the template), `ResolvedRefs` (the model
 * config, servers and skills resolve), `Compatible` (the resolved configuration
 * fits the Harness) and `Ready` (the current revision is compiled and its
 * golden snapshot exists). Compile downgrades are the entry's `warnings`, not a
 * condition. Every condition is positive-polarity.
 */
export const AgentConditionType = {
  Accepted: 'Accepted',
  ResolvedRefs: 'ResolvedRefs',
  Compatible: 'Compatible',
  Ready: 'Ready',
} as const;

/**
 * What one admitting Harness reports for the template — the same rules
 * agent-manager's `get_agent_status` applies, so the portal and the tool agree:
 *
 * - `ready` — `Ready=True`.
 * - `failed` — `Accepted=False` or `Compatible=False`.
 * - `progressing` — `Accepted=True` while the revision is not ready
 *   (`desiredRevision != latestSuccessfulRevision`, or `Ready != True`).
 * - `pending` — the Harness has not written its verdict yet.
 */
export type HarnessReadiness = 'ready' | 'progressing' | 'failed' | 'pending';

/**
 * Readiness of an agent, derived from `status.harnesses[]`.
 *
 * - `ready` — the deciding Harness reports the template ready: sessions can start.
 * - `notReady` — admitted and accepted, but the revision is still compiling
 *   (`progressing`).
 * - `notAccepted` — the deciding Harness rejected the template (`failed`).
 * - `notAdmitted` — no Harness admits the template although the controller has
 *   seen the current spec: the admission label is missing or selects nothing.
 *   Nothing changes without a spec edit, so it is its own not-ready state with
 *   its own reason rather than a `pending` that never resolves.
 * - `pending` — not reconciled yet, or reconciled against an older generation,
 *   so the status does not describe the current spec. Distinct from
 *   `notReady`: it means "not known yet", not "broken".
 */
export type AgentReadiness =
  | 'ready'
  | 'notReady'
  | 'notAccepted'
  | 'notAdmitted'
  | 'pending';

/** One admitting Harness, as the pages present it. */
export type AgentHarness = {
  name: string;
  readiness: HarnessReadiness;
  /** Compile downgrades: features the Harness could not honour. */
  warnings: string[];
  desiredRevision?: string;
  latestSuccessfulRevision?: string;
  conditions: AgentHarnessCondition[];
};

const HARNESS_READINESS_ORDER: Record<HarnessReadiness, number> = {
  ready: 0,
  progressing: 1,
  pending: 2,
  failed: 3,
};

function harnessStatuses(json: AgentInterface): AgentHarnessStatus[] {
  return json.status?.harnesses ?? [];
}

function harnessConditions(
  harness: AgentHarnessStatus,
): AgentHarnessCondition[] {
  return [...(harness.conditions ?? [])];
}

function findHarnessCondition(
  harness: AgentHarnessStatus,
  type: string,
): AgentHarnessCondition | undefined {
  return harnessConditions(harness).find(condition => condition.type === type);
}

function conditionStatus(
  harness: AgentHarnessStatus,
  type: string,
): string | undefined {
  return findHarnessCondition(harness, type)?.status;
}

/** Derive what one Harness entry says — see {@link HarnessReadiness}. */
export function deriveHarnessReadiness(
  harness: AgentHarnessStatus,
): HarnessReadiness {
  if (conditionStatus(harness, AgentConditionType.Ready) === 'True') {
    return 'ready';
  }
  if (
    conditionStatus(harness, AgentConditionType.Accepted) === 'False' ||
    conditionStatus(harness, AgentConditionType.Compatible) === 'False'
  ) {
    return 'failed';
  }
  if (conditionStatus(harness, AgentConditionType.Accepted) === 'True') {
    // Ready is not True here, so the revision is still being prepared —
    // whether or not `desiredRevision` already differs from the last success.
    return 'progressing';
  }
  return 'pending';
}

/**
 * Whether the reported status describes an *older* spec than the one currently
 * stored — the controller has seen the object but not yet caught up.
 *
 * Staleness is only claimed when observedGeneration is actually present and
 * behind. The controller stamps it on every status write, but the CRD marks it
 * optional — whereas `metadata.generation` is always set by the apiserver.
 * Treating "absent" as "stale" would fail closed: against a build that writes
 * harness entries but not `status.observedGeneration`, *every* agent on that
 * installation would read `pending`, hiding healthy and broken agents behind the
 * same explanation-free label. Absent means "cannot tell", so this reports
 * `false` and callers report what the harness entries actually say.
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
 * Whether the controller has reconciled exactly the stored spec, so an empty
 * `status.harnesses[]` is a fact about the labels and not a status still to come.
 */
function isObservedGenerationCurrent(json: AgentInterface): boolean {
  const { generation } = json.metadata ?? {};
  const observedGeneration = json.status?.observedGeneration;

  return (
    typeof generation === 'number' &&
    typeof observedGeneration === 'number' &&
    observedGeneration === generation
  );
}

/**
 * The Harness entry whose verdict is the agent's: the platform Harness named by
 * the admission label when it reports, else the readiest of the others. The
 * platform Harness is the one sessions from the portal run on, so its verdict
 * is what "can I start a session" needs — another Harness being ready does not
 * make it so.
 */
export function decidingHarnessStatus(
  json: AgentInterface,
): AgentHarnessStatus | undefined {
  const harnesses = harnessStatuses(json);
  const platformHarness = json.metadata?.labels?.[HARNESS_LABEL];
  const labelled = harnesses.find(
    harness => platformHarness !== undefined && harness.harness === platformHarness,
  );
  if (labelled) {
    return labelled;
  }
  return [...harnesses].sort(
    (a, b) =>
      HARNESS_READINESS_ORDER[deriveHarnessReadiness(a)] -
      HARNESS_READINESS_ORDER[deriveHarnessReadiness(b)],
  )[0];
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
  const harnesses = harnessStatuses(json);

  if (harnesses.length === 0) {
    // No Harness admits the template. Once the controller has looked at the
    // current spec (observedGeneration caught up) that is a fact about the
    // labels and nothing changes without a spec edit; before that — or when the
    // controller records no observedGeneration at all — it is not known yet.
    return isObservedGenerationCurrent(json) ? 'notAdmitted' : 'pending';
  }

  if (isAgentStatusStale(json)) {
    return 'pending';
  }

  const deciding = decidingHarnessStatus(json);
  switch (deciding ? deriveHarnessReadiness(deciding) : 'pending') {
    case 'ready':
      return 'ready';
    case 'failed':
      return 'notAccepted';
    case 'progressing':
      return 'notReady';
    default:
      return 'pending';
  }
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
 * `lastTransitionTime` across every Harness entry's conditions, falling back to
 * the creation timestamp for an agent no Harness has reported on yet.
 * `undefined` when neither is parseable.
 *
 * "Most recent across all conditions" is deliberately an *activity* signal, not
 * a per-condition age: while a Harness is actively flipping conditions it keeps
 * moving, and once the agent is durably stuck it stops. That is what lets a
 * caller back off from polling an agent that is broken rather than still
 * converging.
 */
export function getAgentStatusChangedAt(
  json: AgentInterface,
): number | undefined {
  const transitionTimes = harnessStatuses(json)
    .flatMap(harnessConditions)
    .map(condition => Date.parse(condition.lastTransitionTime))
    .filter(time => !Number.isNaN(time));

  if (transitionTimes.length > 0) {
    return Math.max(...transitionTimes);
  }

  const createdAt = Date.parse(json.metadata?.creationTimestamp ?? '');

  return Number.isNaN(createdAt) ? undefined : createdAt;
}

function toAgentHarness(harness: AgentHarnessStatus): AgentHarness {
  return {
    name: harness.harness,
    readiness: deriveHarnessReadiness(harness),
    warnings: [...(harness.warnings ?? [])],
    desiredRevision: harness.desiredRevision,
    latestSuccessfulRevision: harness.latestSuccessfulRevision,
    conditions: harnessConditions(harness),
  };
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
 * kagent AgentTemplate — a reusable agent definition (model, system prompt, tool
 * bindings, commit-pinned skills) that Harnesses admit by label and people
 * instantiate per conversation. Rendered by the Generic chart's release, which
 * is what the Flux provenance labels on the object point back to.
 */
export class Agent extends KubeObject<AgentInterface> {
  static readonly supportedVersions = ['v1alpha3'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'AgentTemplate' as const;
  static readonly plural = 'agenttemplates';

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

  getDescription() {
    return this.jsonData.spec?.description;
  }

  /** Name of the referenced ModelConfig, always in the template's own namespace. */
  getModelConfigName() {
    return this.jsonData.spec?.modelConfig?.name;
  }

  /** The inline system prompt. A prompt sourced from a ConfigMap reads as undefined. */
  getSystemMessage() {
    return this.jsonData.spec?.systemPrompt;
  }

  /** The ConfigMap key the system prompt is read from, when it is not inline. */
  getSystemMessageSource() {
    return this.jsonData.spec?.systemPromptFrom;
  }

  /** The skills mounted into the agent, each with its pin. */
  getSkills(): AgentSkill[] {
    return (this.jsonData.spec?.skills ?? []).map(toAgentSkill);
  }

  /** Number of skills mounted by the agent. */
  getSkillCount() {
    return this.jsonData.spec?.skills?.length ?? 0;
  }

  /** Every `spec.tools[]` binding: MCP servers and other templates. */
  getToolBindings(): AgentToolBinding[] {
    return [...(this.jsonData.spec?.tools ?? [])];
  }

  /** The MCP servers the agent draws tools from, all in its own namespace. */
  getMcpBindings(): AgentMcpBinding[] {
    return this.getToolBindings()
      .map(binding => binding.mcp)
      .filter((binding): binding is AgentMcpBinding => Boolean(binding));
  }

  /** Other templates this agent invokes as tools (A2A). */
  getAgentRefs(): AgentToolAgentRef[] {
    return this.getToolBindings()
      .map(binding => binding.agent)
      .filter((ref): ref is AgentToolAgentRef => Boolean(ref));
  }

  /** The Harness the admission label names, when the template carries it. */
  getHarnessLabel(): string | undefined {
    return this.getLabels()?.[HARNESS_LABEL];
  }

  /** Every admitting Harness with its verdict, the deciding one first. */
  getHarnesses(): AgentHarness[] {
    const deciding = decidingHarnessStatus(this.jsonData);
    return harnessStatuses(this.jsonData)
      .map(toAgentHarness)
      .sort((a, b) =>
        a.name === deciding?.harness ? -1 : b.name === deciding?.harness ? 1 : 0,
      );
  }

  /** The Harness whose verdict is the agent's readiness. See {@link decidingHarnessStatus}. */
  getDecidingHarness(): AgentHarness | undefined {
    const deciding = decidingHarnessStatus(this.jsonData);
    return deciding ? toAgentHarness(deciding) : undefined;
  }

  /**
   * The conditions that explain the current readiness: those of the deciding
   * Harness. `undefined` when no Harness admits the template.
   */
  getConditions(): AgentHarnessCondition[] | undefined {
    const deciding = decidingHarnessStatus(this.jsonData);
    return deciding ? harnessConditions(deciding) : undefined;
  }

  getCondition(type: string) {
    const deciding = decidingHarnessStatus(this.jsonData);
    return deciding ? findHarnessCondition(deciding, type) : undefined;
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

  /** Readiness derived from the Harness entries. See {@link AgentReadiness}. */
  getReadiness(): AgentReadiness {
    return deriveAgentReadiness(this.jsonData);
  }

  /**
   * Human-readable detail for the current readiness, taken from whichever
   * condition determined it — or, for a template no Harness admits, the reason
   * that is so. `undefined` when the agent is ready, or when the state needs no
   * explanation.
   */
  getReadinessMessage(): string | undefined {
    switch (this.getReadiness()) {
      case 'notAdmitted': {
        const label = this.getHarnessLabel();
        return label
          ? `No Harness admits this agent: the label ${HARNESS_LABEL}=${label} selects none.`
          : `No Harness admits this agent: it carries no ${HARNESS_LABEL} label.`;
      }
      case 'notAccepted':
        return this.firstFailingMessage([
          AgentConditionType.Accepted,
          AgentConditionType.Compatible,
        ]);
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
   * Compile downgrades the admitting Harnesses report — features they could not
   * honour — prefixed with the Harness name when more than one admits the
   * template. Independent of readiness: a ready agent can carry them, so they
   * are reported separately rather than folded into {@link getReadiness}.
   */
  getHarnessWarnings(): string[] {
    const harnesses = this.getHarnesses();
    return harnesses.flatMap(harness =>
      harness.warnings.map(warning =>
        harnesses.length > 1 ? `${harness.name}: ${warning}` : warning,
      ),
    );
  }

  private firstFailingMessage(types: string[]): string | undefined {
    return (
      types
        .map(type => this.getCondition(type))
        .find(condition => condition && condition.status !== 'True')
        ?.message || undefined
    );
  }
}
