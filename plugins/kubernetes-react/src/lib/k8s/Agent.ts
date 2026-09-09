import { KubeObject, KubeObjectInterface } from './KubeObject';

/**
 * `kagent.dev/v1alpha3 AgentTemplate` — the agent unit on kagent `main`.
 *
 * The 0.10 `Agent` CRD (one Deployment per agent, `spec.declarative.*`) is gone
 * on kagent `main`; an agent is an **AgentTemplate** — model, prompt, tools,
 * skills — that a **Harness** admits (by label selector) and prepares, and that
 * people instantiate per conversation as an AgentInstance. The class keeps the
 * name `Agent` and its getter surface so the Agent Platform pages need no
 * rename; the JSON shape underneath is the v1alpha3 template.
 *
 * Typed locally: `@giantswarm/k8s-types` carries no v1alpha3 yet.
 */
export interface AgentTemplateCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
  observedGeneration?: number;
}

/** `status.harnesses[]` — one entry per Harness that admits the template. */
export interface AgentTemplateHarnessStatus {
  harness: string;
  desiredRevision?: string;
  latestSuccessfulRevision?: string;
  /** Compile downgrades: features the harness could not honour. */
  warnings?: string[];
  conditions?: AgentTemplateCondition[];
}

/** `spec.tools[]` — an MCP server (whole, or a subset of its tools) or another template. */
export interface AgentTemplateToolBinding {
  mcp?: {
    server: { apiGroup?: string; kind?: string; name: string };
    tools?: string[];
  };
  agent?: {
    name: string;
    description?: string;
    templateRef: { name: string };
    isolation?: 'Shared' | 'Dedicated';
  };
}

/** `spec.skills[]` — a skill directory mounted from a git commit, an OCI artifact or a bucket object. */
export interface AgentTemplateSkill {
  name: string;
  source: {
    oci?: string;
    git?: { url: string; commit: string };
    bucket?: { s3: { endpoint: string; bucket: string; key: string; versionId: string; region?: string } };
    path?: string;
  };
}

export interface AgentTemplateInterface extends KubeObjectInterface {
  spec?: {
    modelConfig?: { name: string };
    description?: string;
    systemPrompt?: string;
    systemPromptFrom?: { name: string; key: string };
    tools?: AgentTemplateToolBinding[];
    skills?: AgentTemplateSkill[];
    plugins?: unknown[];
  };
  status?: {
    observedGeneration?: number;
    harnesses?: AgentTemplateHarnessStatus[];
  };
}

type AgentInterface = AgentTemplateInterface;

/**
 * A tool entry in the shape the Agent Platform pages consume — the 0.10
 * `spec.declarative.tools[]` vocabulary (`mcpServer`, `agent`), rendered from a
 * v1alpha3 tool binding. `headersFrom` is always absent on a template: on kagent
 * `main` headers live on the `RemoteMCPServer` a binding points at, not on the
 * binding.
 */
export type AgentTool = {
  mcpServer?: AgentMcpServerRef;
  agent?: AgentToolAgentRef;
  headersFrom?: Array<{ name: string; value?: string }>;
};

/** An MCP server binding: which `RemoteMCPServer`/`MCPServer`, and optionally which of its tools. */
export type AgentMcpServerRef = {
  kind?: string;
  name: string;
  /** Always the template's own namespace — v1alpha3 bindings are same-namespace. */
  namespace?: string;
  toolNames?: string[];
  /** Not a v1alpha3 concept; kept so approval-aware consumers compile. */
  requireApproval?: string[];
};

/** Another template invoked as a tool over A2A. */
export type AgentToolAgentRef = {
  name: string;
  namespace?: string;
  description?: string;
};

/** A skill reference in the shape the create flow and the skill cards share. */
export type AgentSkillRef = {
  name: string;
  /** The git repository URL, or the OCI reference. */
  url?: string;
  /** Subdirectory within the source, when the skill is not at its root. */
  path?: string;
  /** The pinned git commit. */
  ref?: string;
  source: 'git' | 'oci' | 'bucket';
};

/**
 * Condition types the kagent controller sets **per harness** on a template:
 * `Accepted` (the harness's admission selector matches), `ResolvedRefs` (model
 * config, servers and skills resolve), `Compatible` (the resolved configuration
 * fits the harness) and `Ready` (the harness prepared the template — its golden
 * snapshot exists). Warnings are a list on the harness status, not a condition.
 */
export const AgentConditionType = {
  Accepted: 'Accepted',
  ResolvedRefs: 'ResolvedRefs',
  Compatible: 'Compatible',
  Ready: 'Ready',
  /** Not set on kagent `main`; kept for consumers that name it. */
  UnsupportedFeatures: 'UnsupportedFeatures',
} as const;

/**
 * Readiness of an agent, derived from its harness statuses.
 *
 * - `ready` — at least one harness reports `Ready=True`: sessions can start.
 * - `notReady` — a harness admits it but has not (or could not) prepare it.
 * - `notAccepted` — no harness admits it (no `kagent.dev/harness` label a
 *   Harness selects), or every admitting harness rejects the spec.
 * - `pending` — not reconciled yet, or reconciled against an older generation,
 *   so the status does not describe the current spec. Distinct from
 *   `notReady`: it means "not known yet", not "broken".
 */
export type AgentReadiness = 'ready' | 'notReady' | 'notAccepted' | 'pending';

function harnessStatuses(json: AgentInterface): AgentTemplateHarnessStatus[] {
  return json.status?.harnesses ?? [];
}

function conditionOf(
  harness: AgentTemplateHarnessStatus,
  type: string,
): AgentTemplateCondition | undefined {
  return harness.conditions?.find(condition => condition.type === type);
}

function isTrue(
  harness: AgentTemplateHarnessStatus,
  type: string,
): boolean {
  return conditionOf(harness, type)?.status === 'True';
}

/**
 * Whether the reported status describes an *older* spec than the one currently
 * stored — the controller has seen the object but not yet caught up.
 *
 * Staleness is only claimed when observedGeneration is actually present and
 * behind. Absent means "cannot tell", so this reports `false` and callers report
 * what the harness statuses actually say.
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
 * Derive an agent's readiness from its raw harness statuses.
 *
 * Exported as a free function (rather than only as an {@link Agent} method) so
 * callers holding raw list data — e.g. a react-query `refetchInterval`
 * callback, which sees `KubeObjectInterface[]` and not hydrated instances — can
 * reuse the exact same derivation instead of reimplementing it.
 */
export function deriveAgentReadiness(json: AgentInterface): AgentReadiness {
  const harnesses = harnessStatuses(json);

  if (harnesses.length === 0) {
    // No harness admits the template. Before the controller has looked at it
    // that is unknown; once it has (an observedGeneration is recorded) it is a
    // fact about the labels, and nothing will change without a spec edit.
    return json.status?.observedGeneration === undefined
      ? 'pending'
      : 'notAccepted';
  }

  if (isAgentStatusStale(json)) {
    return 'pending';
  }

  if (harnesses.some(harness => isTrue(harness, AgentConditionType.Ready))) {
    return 'ready';
  }

  if (harnesses.every(harness => !isTrue(harness, AgentConditionType.Accepted))) {
    return 'notAccepted';
  }

  return 'notReady';
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
 * `lastTransitionTime` across every harness's conditions, falling back to the
 * creation timestamp for an agent the controller has not written a status for
 * yet. `undefined` when neither is parseable.
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
  const transitionTimes = harnessStatuses(json)
    .flatMap(harness => harness.conditions ?? [])
    .map(condition => Date.parse(condition.lastTransitionTime ?? ''))
    .filter(time => !Number.isNaN(time));

  if (transitionTimes.length > 0) {
    return Math.max(...transitionTimes);
  }

  const createdAt = Date.parse(json.metadata?.creationTimestamp ?? '');

  return Number.isNaN(createdAt) ? undefined : createdAt;
}

/**
 * The harness whose conditions explain the agent's readiness: a Ready one if
 * any, else the first that admits it.
 */
function explainingHarness(
  json: AgentInterface,
): AgentTemplateHarnessStatus | undefined {
  const harnesses = harnessStatuses(json);
  return (
    harnesses.find(harness => isTrue(harness, AgentConditionType.Ready)) ??
    harnesses[0]
  );
}

/**
 * A v1alpha3 binding in the `mcpServer` / `agent` vocabulary. No namespace is
 * stamped on the refs: v1alpha3 bindings are same-namespace by construction, and
 * consumers default an absent namespace to the template's own.
 */
function toAgentTool(binding: AgentTemplateToolBinding): AgentTool {
  const tool: AgentTool = {};
  if (binding.mcp) {
    tool.mcpServer = {
      kind: binding.mcp.server.kind,
      name: binding.mcp.server.name,
      ...(binding.mcp.tools &&
        binding.mcp.tools.length > 0 && { toolNames: binding.mcp.tools }),
    };
  }
  if (binding.agent) {
    tool.agent = {
      name: binding.agent.templateRef.name,
      ...(binding.agent.description && {
        description: binding.agent.description,
      }),
    };
  }
  return tool;
}

function toSkillRef(skill: AgentTemplateSkill): AgentSkillRef {
  const { source } = skill;
  if (source.git) {
    return {
      name: skill.name,
      url: source.git.url,
      ref: source.git.commit,
      ...(source.path && { path: source.path }),
      source: 'git',
    };
  }
  if (source.oci) {
    return {
      name: skill.name,
      url: source.oci,
      ...(source.path && { path: source.path }),
      source: 'oci',
    };
  }
  return {
    name: skill.name,
    ...(source.bucket && {
      url: `${source.bucket.s3.endpoint}/${source.bucket.s3.bucket}/${source.bucket.s3.key}`,
    }),
    ...(source.path && { path: source.path }),
    source: 'bucket',
  };
}

/**
 * kagent AgentTemplate — a reusable agent definition (model, system prompt,
 * tools, skills) that Harnesses admit by label and people instantiate per
 * conversation.
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
    return (
      this.getAnnotations()?.['ui.giantswarm.io/display-name'] ?? this.getName()
    );
  }

  /**
   * Every template is declarative on kagent `main` — there is no bring-your-own
   * container variant; a BYO runtime is a Harness, not an agent.
   */
  getType(): 'Declarative' {
    return 'Declarative';
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

  /** Where the system prompt comes from when it is not inline. */
  getSystemMessageSource() {
    return this.jsonData.spec?.systemPromptFrom;
  }

  /** The skills mounted into the agent, in the shape the skill cards render. */
  getSkillRefs(): AgentSkillRef[] {
    return (this.jsonData.spec?.skills ?? []).map(toSkillRef);
  }

  /** Number of skills mounted by the agent. */
  getSkillCount() {
    return this.jsonData.spec?.skills?.length ?? 0;
  }

  /** The raw v1alpha3 tool bindings. */
  getToolBindings(): AgentTemplateToolBinding[] {
    return [...(this.jsonData.spec?.tools ?? [])];
  }

  /**
   * Everything the agent may call — MCP servers and other templates — in the
   * `mcpServer` / `agent` vocabulary the pages consume.
   */
  getTools(): AgentTool[] {
    return this.getToolBindings().map(toAgentTool);
  }

  /** The MCP servers the agent draws tools from. */
  getMcpServerRefs(): AgentMcpServerRef[] {
    return this.getTools()
      .map(tool => tool.mcpServer)
      .filter((ref): ref is AgentMcpServerRef => Boolean(ref));
  }

  /** Other templates this agent invokes as tools (A2A). */
  getAgentRefs(): AgentToolAgentRef[] {
    return this.getTools()
      .map(tool => tool.agent)
      .filter((ref): ref is AgentToolAgentRef => Boolean(ref));
  }

  /** The label a Harness selects the template by, when present. */
  getHarnessLabel(): string | undefined {
    return this.getLabels()?.['kagent.dev/harness'];
  }

  /** `status.harnesses[]` verbatim. */
  getHarnessStatuses(): AgentTemplateHarnessStatus[] {
    return harnessStatuses(this.jsonData);
  }

  /**
   * The harnesses that admit the agent, readiest first — what the agent runs on.
   * A session can be started on any of them; kagent prepares each separately.
   */
  getHarnesses(): { name: string; ready: boolean; warnings: string[] }[] {
    return this.getHarnessStatuses()
      .map(harness => ({
        name: harness.harness,
        ready: isTrue(harness, AgentConditionType.Ready),
        warnings: harness.warnings ?? [],
      }))
      .sort((a, b) => Number(b.ready) - Number(a.ready));
  }

  /** Names of the harnesses that report the agent Ready. */
  getReadyHarnessNames(): string[] {
    return this.getHarnesses()
      .filter(harness => harness.ready)
      .map(harness => harness.name);
  }

  /**
   * The conditions that explain the current readiness: those of a Ready harness
   * when there is one, else of the first harness that admits the template.
   * `undefined` when no harness does.
   */
  getConditions(): AgentTemplateCondition[] | undefined {
    return explainingHarness(this.jsonData)?.conditions;
  }

  /** Spec revision currently stored, bumped by the apiserver on every change. */
  getGeneration(): number | undefined {
    return this.jsonData.metadata?.generation;
  }

  /** Spec revision the reported status was computed from, when the controller records it. */
  getObservedGeneration(): number | undefined {
    return this.jsonData.status?.observedGeneration;
  }

  /** Whether the reported status is known to describe an older spec. See {@link isAgentStatusStale}. */
  isStale(): boolean {
    return isAgentStatusStale(this.jsonData);
  }

  getCondition(type: string) {
    const harness = explainingHarness(this.jsonData);
    return harness ? conditionOf(harness, type) : undefined;
  }

  /** Readiness derived from the harness statuses. See {@link AgentReadiness}. */
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
      case 'notAccepted': {
        if (this.getHarnessStatuses().length === 0) {
          const label = this.getHarnessLabel();
          return label
            ? `No Harness admits this agent: nothing selects the label kagent.dev/harness=${label}.`
            : 'No Harness admits this agent: it carries no kagent.dev/harness label.';
        }
        return (
          this.getCondition(AgentConditionType.Accepted)?.message || undefined
        );
      }
      case 'notReady':
        return (
          [
            AgentConditionType.ResolvedRefs,
            AgentConditionType.Compatible,
            AgentConditionType.Ready,
          ]
            .map(type => this.getCondition(type))
            .find(condition => condition && condition.status !== 'True')
            ?.message || undefined
        );
      default:
        return undefined;
    }
  }

  /**
   * Soft warnings from the harnesses: features the runtime downgraded while
   * compiling the template. Independent of readiness — a ready agent can carry
   * them — so they are reported separately rather than folded into
   * {@link getReadiness}.
   */
  getUnsupportedFeaturesWarning(): string | undefined {
    const warnings = this.getHarnessStatuses().flatMap(harness =>
      (harness.warnings ?? []).map(warning =>
        this.getHarnessStatuses().length > 1
          ? `${harness.harness}: ${warning}`
          : warning,
      ),
    );
    return warnings.length > 0 ? warnings.join('\n') : undefined;
  }
}
