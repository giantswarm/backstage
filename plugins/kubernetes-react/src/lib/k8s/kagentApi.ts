import { core, crds } from '@giantswarm/k8s-types';

/**
 * The kagent API group. `@giantswarm/k8s-types` still describes the kinds
 * under their previous group (`kagent.dev`), so the shapes that moved or were
 * added with the `Agent` kind are declared here until that package follows.
 */
export const KAGENT_API_GROUP = 'api.kagent.dev';

export const KAGENT_API_VERSION = 'v1alpha3';

export type KagentApiVersion = 'api.kagent.dev/v1alpha3';

type GeneratedTemplateSpec = NonNullable<
  crds.kagent.v1alpha3.AgentTemplate['spec']
>;

type GeneratedToolBinding = NonNullable<GeneratedTemplateSpec['tools']>[number];

/**
 * An MCP binding: a same-namespace `RemoteMCPServer` (`server.kind`/`name`),
 * optionally narrowed to some of its tools, optionally requiring approval before
 * a call.
 */
export type AgentMcpBinding = NonNullable<GeneratedToolBinding['mcp']>;

/** A same-namespace `AgentTemplate` compiled into the agent's runtime as a tool. */
export type AgentSubAgentBinding = {
  name: string;
  description: string;
  templateRef: { name: string };
};

/** One `tools[]` binding: exactly one of `mcp` (a server) or `subAgent`. */
export type AgentToolBinding = {
  mcp?: AgentMcpBinding;
  subAgent?: AgentSubAgentBinding;
};

/** `AgentTemplate.spec`, inline in an `Agent` or on its own object. */
export type AgentTemplateSpec = Omit<GeneratedTemplateSpec, 'tools'> & {
  tools?: AgentToolBinding[];
};

export type AgentCondition = {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime: string;
  observedGeneration?: number;
};

export type AgentStatus = {
  observedGeneration?: number;
  desiredRevision?: string;
  latestSuccessfulRevision?: string;
  warnings?: string[];
  conditions?: AgentCondition[];
};

type GeneratedHarnessSpec = NonNullable<crds.kagent.v1alpha3.Harness['spec']>;

export type HarnessEnvVar = { name: string; value: string };

export type HarnessSubstratePolicy = {
  workerPoolRef: { name: string };
  snapshotPolicy: { location: string };
  /** Hostnames, or leftmost-label wildcards such as `*.githubusercontent.com`. */
  egress?: string[];
};

/** Bounds of one turn on a Claude Code Harness. */
export type ClaudeHarnessLimits = {
  budgetUSD?: string;
  maxTurns?: number;
};

export type HarnessSpec = Omit<
  GeneratedHarnessSpec,
  'allowedAgentTemplates' | 'claude' | 'env' | 'substrate'
> & {
  claude?: { limits?: ClaudeHarnessLimits };
  env?: HarnessEnvVar[];
  substrate: HarnessSubstratePolicy;
};

export interface HarnessInterface {
  apiVersion: KagentApiVersion;
  kind: 'Harness';
  metadata: core.metav1.ObjectMeta;
  spec?: HarnessSpec;
  status?: crds.kagent.v1alpha3.Harness['status'];
}

/**
 * `api.kagent.dev/v1alpha3 Agent`: portable behaviour (the template, inline or
 * by name) paired with the Harness that runs it (inline or by name). The
 * controller writes its verdict to `status.conditions`.
 */
export interface AgentInterface {
  apiVersion: KagentApiVersion;
  kind: 'Agent';
  metadata: core.metav1.ObjectMeta;
  spec?: {
    template?: AgentTemplateSpec;
    templateRef?: { name: string };
    harness?: HarnessSpec;
    harnessRef?: { name: string };
    /** HTTP(S) origins the agent may reach besides what its revision compiles. */
    egress?: string[];
  };
  status?: AgentStatus;
}

/**
 * The generated `ModelConfig`, under the renamed group: the generated literal
 * still spells the old group, so `apiVersion` is widened to a string.
 */
export type ModelConfigInterface = Omit<
  crds.kagent.v1alpha3.ModelConfig,
  'apiVersion'
> & { apiVersion: string };

/** The generated `RemoteMCPServer`, under the renamed group; see {@link ModelConfigInterface}. */
export type RemoteMCPServerInterface = Omit<
  crds.kagent.v1alpha3.RemoteMCPServer,
  'apiVersion'
> & { apiVersion: string };

/** `api.kagent.dev/v1alpha3 AgentTemplate`, the standalone form of an agent's behaviour. */
export interface AgentTemplateInterface {
  apiVersion: KagentApiVersion;
  kind: 'AgentTemplate';
  metadata: core.metav1.ObjectMeta;
  spec?: AgentTemplateSpec;
}
