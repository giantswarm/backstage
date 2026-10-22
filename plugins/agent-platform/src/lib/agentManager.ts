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

import type { MusterServerPresence } from '../hooks/useMusterServerAvailability';

/** The MCPServer name muster registers agent-manager under. */
export const AGENT_MANAGER_SERVER = 'agent-manager';

/**
 * Why agent-manager cannot be used on an installation, in one sentence, from
 * its presence (`useAgentManagerAvailability`): muster lists no agent-manager,
 * or muster has no per-user sign-in in this portal, so muster-backend refuses
 * agent-manager's tools rather than run them under muster's shared identity.
 * `undefined` for any other presence: available, or not known yet.
 */
export function agentManagerBlocker(
  presence: MusterServerPresence,
  installation: string,
): string | undefined {
  switch (presence) {
    case 'missing':
      return `Muster on ${installation} lists no agent-manager.`;
    case 'sharedIdentity':
      return `Muster on ${installation} has no per-user sign-in in this portal, so agent-manager would act under muster's shared identity instead of as you. A platform admin can give the installation's muster entry an authProvider.`;
    case 'available':
    case 'unknown':
      return undefined;
    default: {
      const unhandled: never = presence;
      return unhandled;
    }
  }
}

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
  listEgressPolicies: 'list_egress_policies',
  startSession: 'start_session',
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
 * One `plugins[]` entry of the create contract (and of the chart values): a
 * plugin directory at exactly one immutable source and, for an Agent Plugins
 * package, the names of the skills it enables. A Claude Code plugin loads
 * whole and carries no selection. The portal writes git plugins pinned to the
 * commit the skills step showed; agent-manager reports OCI ones by digest.
 */
export type AgentPluginEntry = {
  path?: string;
  git?: { url: string; ref?: string; commit?: string };
  oci?: string;
  skills?: string[];
};

/**
 * What the portal sends to `validate_agent` and `create_agent` — the form
 * model. Everything but `name`, `modelConfig` and `toolset` is optional and an
 * omitted field keeps the chart's default. There is no per-skill credential.
 */
export type AgentSpec = {
  /** The ModelConfig's namespace: where the release and the Agent land. */
  namespace: string;
  /** DNS-1123 technical name: the HelmRelease and Agent object name. */
  name: string;
  displayName: string;
  description?: string;
  systemMessage?: string;
  /** Name of an existing ModelConfig in `namespace`. */
  modelConfig: string;
  /**
   * The name of a Harness in `namespace` the agent runs on (chart
   * `agent.harness`, the Agent's `spec.harnessRef.name`). Omitted, the
   * platform Harness. Fixed at create.
   */
  harness?: string;
  /** Avatar URL (chart `agent.iconUrl`, rendered as an annotation). */
  iconUrl?: string;
  skills?: AgentSkillEntry[];
  plugins?: AgentPluginEntry[];
  /** The toolset selectors exactly as the Tools step composed them. */
  toolset: string[];
  /**
   * HTTP(S) origins the agent may reach besides what its revision compiles
   * (`Agent.spec.egress`), such as `https://github.com:443`.
   */
  egress?: string[];
  /**
   * Names of EgressPolicies in `namespace` whose origins the agent may reach
   * too (`Agent.spec.egressPolicyRefs`). Never on a coding Harness.
   */
  egressPolicyRefs?: string[];
  /**
   * The workspace, `<namespace>/<name>` in the agent's namespace, its
   * Sessions start in unless the person picks another or none
   * (`agent-platform.giantswarm.io/default-workspace`). Omitted, no default.
   */
  defaultWorkspace?: string;
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
    agent: string;
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
  /**
   * Checks the dry run could not make, such as the name-clash check for a
   * person who may not read the namespace's HelmReleases. They do not block
   * the write.
   */
  notes?: string[];
  schemaVersion: string;
  schemaSource: string;
  manifests: AgentManifests;
};

export type AgentStatusVerdict = 'ready' | 'progressing' | 'failed' | 'unknown';

/**
 * The Agent object's own status as agent-manager reads it: the Harness it
 * names (`spec.harnessRef.name`) and the controller's verdict on it.
 */
export type AgentObjectStatus = {
  /** False while the HelmRelease has not rendered the Agent yet. */
  exists: boolean;
  generation?: number;
  observedGeneration?: number;
  harness?: string;
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
  agent?: AgentObjectStatus;
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
 * `start_session`'s input: the Agent by namespace and technical name and the
 * idempotency key of the submission. Without `message` agent-manager only
 * creates the session, and the caller sends the first message itself; with
 * one, agent-manager sends it as the first turn. `workspaceGrant` starts the
 * session in a workspace; absent, it is the plain session, which the client
 * says with `noWorkspace`: agent-manager would otherwise start a call that
 * names no workspace in the agent's default one.
 */
export type StartSessionRequest = {
  namespace: string;
  name: string;
  message?: string;
  requestId: string;
  sessionName?: string;
  workspaceGrant?: string;
};

/**
 * `start_session`'s answer: the new session (proto3 JSON of kagent's
 * `Session`), the first event of its first turn when a message was sent (A2A's
 * `StreamResponse`), and the workspace when it was started with a grant.
 */
export type StartSessionResult = {
  session: { id?: string; contextId?: string; name?: string };
  turn?: unknown;
  workspace?: string;
};

/**
 * How agent-manager writes: `apply` live as the person, `commit` as a pull
 * request in the GitOps repository that owns the release.
 */
export type WriteMode = 'apply' | 'commit';

/** One file of a commit: its content shown on a dry run only. */
export type CommitFile = {
  path: string;
  action: string;
  content?: string;
};

/**
 * A write in mode `commit` (giantswarm/agent-manager#24): the repository that
 * owns the release, the directory and files, and — not on a dry run, and not
 * when the repository already says so — the pull request opened as the person;
 * `liveSteps` are what the merge alone does not do. agent-manager,
 * cluster-manager and model-manager answer it in the same shape.
 */
export type GitOpsCommit = {
  repository: string;
  base: string;
  directory: string;
  /** The Flux Kustomization that lands the files; empty for a named target. */
  kustomization?: string;
  prune: boolean;
  branch: string;
  files: CommitFile[];
  pullRequest?: string;
  number?: number;
  author?: string;
  liveSteps?: string[];
};

/**
 * What a write in mode `commit` answers: `commit`, the pull request. Without
 * the person's GitHub authorization the write is refused with `auth_required`
 * instead (an `AgentManagerError`), never answered here.
 */
export type CommitAgentResult = {
  mode?: string;
  dryRun?: boolean;
  commit?: GitOpsCommit;
};

/**
 * The verdict a create is done at: the Agent is ready on its Harness, or it
 * failed. `progressing` and `unknown` keep polling.
 */
export function isSettledVerdict(verdict: AgentStatusVerdict): boolean {
  return verdict === 'ready' || verdict === 'failed';
}

/**
 * Whether a status describes the revision a write produced, rather than the one
 * that was already there.
 *
 * A verdict alone cannot say: agent-manager writes the **HelmRelease**, and
 * helm-controller re-renders the Agent a few seconds later, so the
 * first `get_agent_status` after an `update_agent` on an agent that was already
 * `ready` answers `ready` — for the revision before the write. Comparing
 * against the generation read immediately before the write is what tells them
 * apart: the Agent's generation has to have moved past it, and the
 * controller has to have caught up with the new one.
 *
 * `observedGeneration` is optional in the status (the same caveat the Agent
 * readiness derivation makes: not every installation sets it), so its absence
 * is not read as "behind" — a generation past the baseline is then the whole
 * signal.
 *
 * With no baseline — the create flow, where there is no earlier generation, and
 * every read not made on behalf of a write — there is nothing to compare and
 * the verdict stands on its own.
 */
export function hasReachedWrittenRevision(
  status: AgentStatus | undefined,
  fromGeneration: number | undefined,
): boolean {
  if (fromGeneration === undefined) {
    return true;
  }
  const generation = status?.agent?.generation;
  if (typeof generation !== 'number' || generation <= fromGeneration) {
    return false;
  }
  const observed = status?.agent?.observedGeneration;
  return typeof observed !== 'number' || observed >= generation;
}

/**
 * agent-manager's error codes, as its MCP tools prefix them
 * (`<code>: <message>`). `forbidden` is the apiserver's refusal for the person
 * (a viewer's Deploy), `conflict` an existing name or a suspended release,
 * `gitops_owned` a live write to a release applied from git,
 * `auth_required` a write in mode `commit` without the person's GitHub
 * authorization, `invalid_request` a schema violation or an unpinnable skill,
 * `unsupported` an operation this installation does not offer.
 */
export type AgentManagerErrorCode =
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'gitops_owned'
  | 'auth_required'
  | 'forbidden'
  | 'unauthenticated'
  | 'unsupported'
  | 'backend_error'
  | 'unknown';

const ERROR_CODES: readonly AgentManagerErrorCode[] = [
  'not_found',
  'invalid_request',
  'conflict',
  'gitops_owned',
  'auth_required',
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
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * agent-manager's refusal to change a release applied from git through a pull
 * request: it edits a release only in its own file, `<directory>/<name>.yaml`,
 * and that file is not on the repository's base branch (`requireReleaseFile`
 * in agent-manager's internal/agents/commit.go). It checks that one path and
 * nothing else: the release may be defined anywhere else in the repository, or
 * in its directory under another name.
 */
export type MissingReleaseFile = {
  /** The HelmRelease, `namespace/name`. */
  release: string;
  /** agent-manager's directory, e.g. `management-clusters/gazelle/extras/agent-manager`. */
  directory: string;
  /** The repository, `owner/name`. */
  repository: string;
  /** The file agent-manager looked for and did not find. */
  path: string;
};

// agent-manager reports this refusal only as a `conflict` in prose, so the
// message is parsed; the test pins agent-manager's exact wording. A rewording
// there turns this back into the raw conflict on confirm, nothing worse.
const MISSING_RELEASE_FILE =
  /HelmRelease (\S+) is not in agent-manager's directory (\S+) of (\S+) \(no (\S+) there\)/;

/**
 * Whether a refusal is agent-manager's missing-release-file conflict, and if so
 * for which release, directory, repository and path. `undefined` for any other
 * refusal, which keeps its own message.
 */
export function missingReleaseFile(
  failure: { code?: AgentManagerErrorCode; message: string } | undefined,
): MissingReleaseFile | undefined {
  if (failure?.code !== 'conflict') {
    return undefined;
  }
  const match = failure.message.match(MISSING_RELEASE_FILE);
  if (!match) {
    return undefined;
  }
  return {
    release: match[1],
    directory: match[2],
    repository: match[3],
    path: match[4],
  };
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
      { cause: error },
    );
  }
  if (looksNotConnected(message)) {
    return new AgentManagerNotConnectedError(message, { cause: error });
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
 * `Agent` object with no release behind it, refused as well.
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
 * digest), the declared toolset, the Agent object's status and the HelmRelease
 * values (the chart contract). Mirrors `Agent` in `internal/agents/types.go`.
 */
export type AgentManagerAgent = {
  name: string;
  namespace: string;
  /** False while the release has not rendered the Agent object (yet). */
  exists: boolean;
  displayName?: string;
  description?: string;
  modelConfig?: string;
  iconUrl?: string;
  systemMessage?: string;
  skills?: AgentSkillEntry[];
  /** The plugins as pinned (a git commit or an OCI digest). */
  plugins?: AgentPluginEntry[];
  /** The declared toolset; absent for an agent without one. */
  toolset?: string[];
  /** No toolset declared, muster bound: sees every tool the gateway exposes. */
  implicitFullAccess?: boolean;
  ready: boolean | null;
  /** The Harness that runs the agent (`spec.harnessRef.name`). */
  harness?: string;
  /** The extra HTTP(S) origins the agent may reach (`spec.egress`). */
  egress?: string[];
  /** The EgressPolicies of its namespace it picks (`spec.egressPolicyRefs`). */
  egressPolicyRefs?: string[];
  /** The agent's default workspace, `<namespace>/<name>`; absent, none. */
  defaultWorkspace?: string;
  status?: AgentObjectStatus;
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

/** `get_info`'s capability for `egressPolicyRefs` and `list_egress_policies`. */
export const EGRESS_POLICIES_CAPABILITY = 'egressPolicies';

/**
 * One origin of an EgressPolicy. `credentialHeader` names the request header
 * the egress gateway fills from the policy's credential; the Secret behind it
 * is never reported.
 */
export type EgressDestination = {
  origin: string;
  credentialHeader?: string;
};

/** `list_egress_policies`: an EgressPolicy an agent of its namespace may pick. */
export type AgentManagerEgressPolicy = {
  name: string;
  namespace: string;
  destinations: EgressDestination[];
  managedBy?: string;
};

/**
 * `update_agent` (and `validate_agent` with `update: true`): a partial change.
 * Only the fields present change; an empty string clears a field back to the
 * chart's default; `skills`, `plugins` and `toolset` replace their whole list;
 * `refreshSkills` re-pins every git skill and plugin to its repository's
 * default-branch head and changes nothing else. The portal never sends `force`.
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
  /** Replaces the whole list; an empty list clears it. */
  plugins?: AgentPluginEntry[];
  toolset?: string[];
  /** Replaces the whole list; an empty list clears it. */
  egress?: string[];
  /** Replaces the whole list; an empty list clears it. */
  egressPolicyRefs?: string[];
  /** `<namespace>/<name>`; `""` removes the default. */
  defaultWorkspace?: string;
  refreshSkills?: boolean;
  /**
   * Moves the agent to another Harness of its namespace after the checks a
   * create on it runs; `""` selects the platform Harness. Sessions keep the
   * revision they started on.
   */
  harness?: string;
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
 * `update_agent` with `mode: commit` and `dryRun`: the merged values as
 * `update_agent` reports them, plus the pull request it would open (whose
 * files carry their full content on a dry run).
 */
export type UpdateAgentCommitDryRun = UpdateAgentResult & CommitAgentResult;

/**
 * `delete_agent`: what went. The shared per-namespace `OCIRepository` of the
 * chart stays while another release references it (or the check could not be
 * made) — `ociRepositoryKept` is agent-manager's reason. Nothing renders it, or
 * `requestedBy`: the reason names every other release in the namespace and the
 * caller is the reader (see the toast rule in `docs/ui.md`).
 */
export type DeleteAgentResult = {
  name: string;
  namespace: string;
  helmReleaseDeleted: boolean;
  agentDeleted?: boolean;
  remoteMcpServerDeleted?: boolean;
  ociRepositoryDeleted: boolean;
  ociRepositoryKept?: string;
  requestedBy?: string;
};
