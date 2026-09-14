/**
 * agent-manager's tool contract, as the portal calls it through muster.
 *
 * agent-manager is the Agent Platform's write surface for agents: it composes a
 * Flux `HelmRelease` of the Generic agent chart (1.x) plus the shared
 * per-namespace `OCIRepository`, validates the values against the chart's
 * `values.schema.json`, pins every skill to a commit and writes as the caller.
 * It speaks MCP only; the portal reaches it as the signed-in person through the
 * installation's muster, where its tools appear as `x_agent-manager_<tool>`.
 * The shapes here mirror `internal/agents/types.go` of giantswarm/agent-manager
 * — the portal composes nothing of its own.
 */

/** The MCPServer name muster registers agent-manager under. */
export const AGENT_MANAGER_SERVER = 'agent-manager';

/** The tools this plugin calls, by their agent-manager name. */
export const AGENT_MANAGER_TOOLS = {
  getInfo: 'get_info',
  validateAgent: 'validate_agent',
  createAgent: 'create_agent',
  getAgentStatus: 'get_agent_status',
  getAgent: 'get_agent',
  updateAgent: 'update_agent',
  deleteAgent: 'delete_agent',
  listModelConfigs: 'list_model_configs',
} as const;

export type AgentManagerTool =
  (typeof AGENT_MANAGER_TOOLS)[keyof typeof AGENT_MANAGER_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function agentManagerToolName(tool: AgentManagerTool): string {
  return `x_${AGENT_MANAGER_SERVER}_${tool}`;
}

/** A git skill, pinned: the repository and the full commit id. */
export type GitSkillSource = {
  url: string;
  commit: string;
};

/**
 * One `skills[]` entry of the create contract (and of the chart 1.x values):
 * a name, a subdirectory and exactly one source. The portal only ever writes
 * git skills pinned to the commit the skills step showed; the OCI shape is
 * part of the contract and rendered when agent-manager reports it back.
 */
export type AgentSkillEntry =
  | { name: string; path?: string; git: GitSkillSource }
  | { name: string; oci: string };

/**
 * What the portal sends to `validate_agent` and `create_agent` — the form
 * model. Everything but `name`, `modelConfig` and `toolset` is optional and an
 * omitted field keeps the chart's default. There is no runtime (every agent
 * runs on the platform Harness) and no per-skill credential.
 */
export type AgentSpec = {
  /** The ModelConfig's namespace: where the release and the template land. */
  namespace: string;
  /** DNS-1123 technical name: the HelmRelease and AgentTemplate name. */
  name: string;
  displayName: string;
  description?: string;
  systemMessage?: string;
  /** Name of an existing ModelConfig in `namespace`. */
  modelConfig: string;
  /** Avatar URL (chart `agent.iconUrl`, rendered as an annotation). */
  iconUrl?: string;
  skills?: AgentSkillEntry[];
  /** The toolset selectors exactly as the Tools step composed them. */
  toolset: string[];
};

export type AgentManagerChart = {
  /** The chart's OCI URL as the OCIRepository carries it. */
  ociUrl: string;
  /** The range the OCIRepository tracks (`1.x`). */
  semver: string;
  /** The newest published version inside that range, when the registry answered. */
  latestVersion?: string;
  /** The chart version whose `values.schema.json` validates right now. */
  schemaVersion: string;
  schemaSource: string;
};

/** `get_info`: what this installation's agent-manager composes and can do. */
export type AgentManagerInfo = {
  version: string;
  chart: AgentManagerChart;
  namespaces: { default: string; managed: string[] };
  /**
   * Explicit flags. `commit` is the one this plugin gates on: `true` once
   * agent-manager can land the manifests as a pull request in the owning
   * GitOps repository (`mode: commit`, giantswarm/agent-manager#24).
   */
  capabilities: Record<string, boolean>;
  /** `caller` when every write runs as the signed-in person. */
  identity: string;
  apiVersions: {
    agentTemplate: string;
    harness: string;
    remoteMcpServer: string;
    modelConfig: string;
    helmRelease: string;
    ociRepository: string;
  };
  flux: {
    helmReleaseInterval: string;
    ociRepositoryInterval: string;
    serviceAccountName?: string;
  };
  /** The platform Harness every agent runs on. */
  harness: { name: string };
  /** The muster MCP URL composed into every agent; empty = the chart default. */
  muster: { url: string };
  skillsRepositories: string[];
};

/** The objects a create applies, as YAML, plus the values they carry. */
export type AgentManifests = {
  ociRepository: string;
  helmRelease: string;
  values: Record<string, unknown>;
};

/** `validate_agent`: a dry run. Nothing was written. */
export type ValidateAgentResult = {
  valid: boolean;
  mode: 'create' | 'update';
  /** Every schema violation and precondition failure, in agent-manager's words. */
  errors?: string[];
  schemaVersion: string;
  schemaSource: string;
  manifests: AgentManifests;
};

export type AgentStatusVerdict = 'ready' | 'progressing' | 'failed' | 'unknown';

/** One admitting Harness's report on the template (`status.harnesses[]`). */
export type HarnessStatus = {
  harness: string;
  ready: boolean | null;
  accepted: boolean | null;
  resolvedRefs: boolean | null;
  compatible: boolean | null;
  desiredRevision?: string;
  latestSuccessfulRevision?: string;
  warnings?: string[];
};

/** `get_agent_status`: one verdict with a one-line summary. */
export type AgentStatus = {
  name: string;
  namespace: string;
  verdict: AgentStatusVerdict;
  summary: string;
  template?: {
    exists: boolean;
    generation?: number;
    observedGeneration?: number;
    harnesses: HarnessStatus[];
  };
  helmRelease?: {
    exists: boolean;
    ready: boolean | null;
    suspended: boolean;
    gitOpsOwned: boolean;
    deleting: boolean;
  };
};

/** `create_agent`: what was applied, as the caller. */
export type CreateAgentResult = {
  agent: { name: string; namespace: string; skills?: AgentSkillEntry[] };
  manifests: AgentManifests;
  created: { ociRepository: boolean; helmRelease: boolean };
  status?: AgentStatus;
  /** The authenticated caller the write ran as. */
  requestedBy?: string;
};

/**
 * `create_agent` with `mode: commit` (giantswarm/agent-manager#24): the
 * manifests land as a pull request in the owning GitOps repository, or the
 * person has to connect the repository first. Named here so the button and its
 * result handling exist; the flag that turns them on is agent-manager's.
 */
export type CommitAgentResult = {
  pullRequestUrl?: string;
  status?: 'auth_required' | string;
  authUrl?: string;
  message?: string;
};

/**
 * The verdict a create is done at: the template is ready on the platform
 * Harness, or it failed. `progressing` and `unknown` keep polling.
 */
export function isSettledVerdict(verdict: AgentStatusVerdict): boolean {
  return verdict === 'ready' || verdict === 'failed';
}

/**
 * agent-manager's error codes, as its MCP tools prefix them
 * (`<code>: <message>`). `forbidden` is the apiserver's refusal for the person
 * (a viewer's Deploy), `conflict` an existing name or a GitOps-owned or
 * suspended release, `invalid_request` a schema violation or an unpinnable
 * skill, `unsupported` an operation this installation does not offer.
 */
export type AgentManagerErrorCode =
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'forbidden'
  | 'unauthenticated'
  | 'unsupported'
  | 'backend_error'
  | 'unknown';

const ERROR_CODES: readonly AgentManagerErrorCode[] = [
  'not_found',
  'invalid_request',
  'conflict',
  'forbidden',
  'unauthenticated',
  'unsupported',
  'backend_error',
];

/** A refusal agent-manager answered, in its own words. */
export class AgentManagerError extends Error {
  readonly name = 'AgentManagerError';
  constructor(
    readonly code: AgentManagerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The person's muster session holds no connection to agent-manager yet: the
 * tool is not in the session's tool set, or muster refuses to open the
 * connection. A sign-in to the server in muster fixes it; the review page
 * offers that step (the frontend counterpart of gs-node's
 * `MusterServerNotConnectedError`).
 */
export class AgentManagerNotConnectedError extends Error {
  readonly name = 'AgentManagerNotConnectedError';
}

/**
 * muster's answers when the session is not connected to a server — the same
 * patterns gs-node's `looksNotConnected` matches on the backend.
 */
const NOT_CONNECTED_PATTERNS = [
  /tool not found/i,
  /unknown tool/i,
  /not connected/i,
  /not authenticated/i,
  /auth(entication|orization)? required/i,
  /requires authentication/i,
];

export function looksNotConnected(message: string): boolean {
  return NOT_CONNECTED_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Classifies what a tool call threw. agent-manager's refusals become
 * {@link AgentManagerError} with their code; muster's "not connected" answers
 * become {@link AgentManagerNotConnectedError}; anything else is passed on.
 */
export function classifyAgentManagerError(error: unknown): Error {
  if (
    error instanceof AgentManagerError ||
    error instanceof AgentManagerNotConnectedError
  ) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([a-z_]+):\s*([\s\S]*)$/);
  if (match && (ERROR_CODES as readonly string[]).includes(match[1])) {
    return new AgentManagerError(
      match[1] as AgentManagerErrorCode,
      match[2] || message,
    );
  }
  if (looksNotConnected(message)) {
    return new AgentManagerNotConnectedError(message);
  }
  return error instanceof Error ? error : new Error(message);
}

/** The manual fallback: install the chart yourself, from the same values. */
export function helmInstallCommand(
  spec: Pick<AgentSpec, 'name' | 'namespace'>,
  chart: Pick<AgentManagerChart, 'ociUrl' | 'latestVersion' | 'semver'>,
): string {
  // A concrete version installs the same chart the release would resolve
  // today; when the registry did not answer, helm resolves the range itself.
  const version = chart.latestVersion ?? chart.semver;
  return `helm install ${spec.name} \\
  ${chart.ociUrl} \\
  --version ${version} \\
  --namespace ${spec.namespace} \\
  --values ${spec.name}-values.yaml`;
}

/**
 * How agent-manager manages an agent: `helmrelease` — a HelmRelease it can
 * write live; `gitops` — the release is applied by a Flux Kustomization, its
 * desired state lives in git and a live write is refused; `none` — a bare
 * `AgentTemplate` with no release behind it, refused as well.
 */
export type AgentManagedBy = 'helmrelease' | 'gitops' | 'none';

/** What `get_agent` says about the release that owns the agent. */
export type AgentHelmReleaseRef = {
  name: string;
  namespace: string;
  ready: boolean | null;
  reason?: string;
  message?: string;
  chartVersion?: string;
  suspended: boolean;
  gitOpsOwned: boolean;
  deleting: boolean;
};

/**
 * `get_agent`: one agent as agent-manager reads it back — the fields the edit
 * form is pre-filled from, the skills as pinned (a git commit or an OCI
 * digest), the declared toolset, the per-Harness status and the HelmRelease
 * values (the chart contract). Mirrors `Agent` in `internal/agents/types.go`.
 */
export type AgentManagerAgent = {
  name: string;
  namespace: string;
  /** False while the release has not rendered the template (yet). */
  exists: boolean;
  displayName?: string;
  description?: string;
  modelConfig?: string;
  iconUrl?: string;
  systemMessage?: string;
  skills?: AgentSkillEntry[];
  /** The declared toolset; absent for an agent without one. */
  toolset?: string[];
  /** No toolset declared, muster bound: sees every tool the gateway exposes. */
  implicitFullAccess?: boolean;
  ready: boolean | null;
  harnesses?: HarnessStatus[];
  managed: AgentManagedBy;
  helmRelease?: AgentHelmReleaseRef;
  /** The HelmRelease's inline values, when a release owns the agent. */
  values?: Record<string, unknown>;
};

/** `list_model_configs`: a ModelConfig an agent may reference. */
export type AgentManagerModelConfig = {
  name: string;
  namespace: string;
  provider?: string;
  model?: string;
  accepted: boolean | null;
  message?: string;
  managedBy?: string;
};

/**
 * `update_agent` (and `validate_agent` with `update: true`): a partial change.
 * Only the fields present change; an empty string clears a field back to the
 * chart's default; `skills` and `toolset` replace their whole list;
 * `refreshSkills` re-pins every git skill to its repository's default-branch
 * head and changes nothing else. The portal never sends `force`.
 */
export type AgentUpdate = {
  namespace: string;
  name: string;
  displayName?: string;
  description?: string;
  systemMessage?: string;
  modelConfig?: string;
  iconUrl?: string;
  skills?: AgentSkillEntry[];
  toolset?: string[];
  refreshSkills?: boolean;
};

/**
 * `update_agent`: the values before and after, the dotted paths that changed
 * (empty when the release was already in the requested state and nothing was
 * written), and the manifests as applied.
 */
export type UpdateAgentResult = {
  agent: AgentManagerAgent;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changed: string[];
  manifests: AgentManifests;
  /** The authenticated caller the write ran as. */
  requestedBy?: string;
};

/**
 * `delete_agent`: what went. The shared per-namespace `OCIRepository` of the
 * chart stays while another release references it (or the check could not be
 * made) — `ociRepositoryKept` is agent-manager's reason, shown as given.
 */
export type DeleteAgentResult = {
  name: string;
  namespace: string;
  helmReleaseDeleted: boolean;
  agentTemplateDeleted?: boolean;
  remoteMcpServerDeleted?: boolean;
  ociRepositoryDeleted: boolean;
  ociRepositoryKept?: string;
  requestedBy?: string;
};
