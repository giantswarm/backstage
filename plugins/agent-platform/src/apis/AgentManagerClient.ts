// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- agent-manager is reached through Muster.
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  AGENT_MANAGER_TOOLS,
  AgentManagerError,
  agentManagerToolName,
  classifyAgentManagerError,
  type AgentManagerAgent,
  type AgentManagerEgressPolicy,
  type AgentManagerInfo,
  type AgentManagerModelConfig,
  type AgentManagerTool,
  type AgentSpec,
  type AgentStatus,
  type AgentUpdate,
  type AgentApprovalChange,
  type AgentApprovalGrant,
  type SetAgentApprovalResult,
  splitAgentUpdate,
  agentGenerationOf,
  type WriteMode,
  type CommitAgentResult,
  type CreateAgentResult,
  type DeleteAgentResult,
  type UpdateAgentCommitDryRun,
  type StartSessionRequest,
  type StartSessionResult,
  type UpdateAgentResult,
  type ValidateAgentResult,
} from '../lib/agentManager';
import type { CredentialResourceResult } from '../lib/credentialOperations';
import { modelEndpointProblem } from '../lib/modelEndpoint';
import type {
  MemberRequest,
  MemberResult,
  OrganizationListing,
  OrganizationConnector,
  OrganizationCredentialReplacement,
  OrganizationModelRequest,
  AgentPlatformOrganization,
  OrganizationDeleteResult,
  OrganizationDetails,
  OrganizationErasure,
  OrganizationMembers,
} from '../lib/organizations';

/**
 * A session's toolchains for `start_session`, named only when the person
 * changed the agent's defaults: none is said with `noToolchains`, since an
 * empty list means the defaults.
 */
function toolchainArgs(toolchains: StartSessionRequest['toolchains']) {
  if (!toolchains) return {};
  return toolchains.length > 0 ? { toolchains } : { noToolchains: true };
}

/** muster's answer for a tool it does not serve. */
function isToolNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /tool not found|unknown tool|no tool/i.test(message) ||
    (error instanceof Error && error.name === 'NotFoundError') ||
    (error as { status?: number })?.status === 404
  );
}

/**
 * A refusal of the second write of an update, after the first landed: said
 * so, keeping agent-manager's code and words.
 */
export class PartialAgentWriteError extends AgentManagerError {
  constructor(
    code: AgentManagerError['code'],
    message: string,
    /** The tool that refused; everything written before it landed. */
    readonly failedTool: string,
    options?: ErrorOptions,
  ) {
    super(code, message, options);
  }
}

function partialWriteError(error: unknown, tool: AgentManagerTool): Error {
  if (error instanceof AgentManagerError) {
    return new PartialAgentWriteError(
      error.code,
      `Saved: the agent's name, description, instructions and model. Not saved (${tool} refused it): what it can reach and its approval settings. ${error.message}`,
      tool,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * A write after another of the same update: its precondition is the
 * generation the one before wrote, when agent-manager reported it; without
 * one, none (the first write already checked the read).
 */
function chainGeneration(
  args: AgentUpdate,
  previous: UpdateAgentResult,
  update: AgentUpdate,
): AgentUpdate {
  if (update.expectedGeneration === undefined) {
    return args;
  }
  const { expectedGeneration: _, ...rest } = args;
  const written = agentGenerationOf(previous.agent);
  return written === undefined
    ? rest
    : { ...rest, expectedGeneration: written };
}

/**
 * The tools that may prepare a credential request. Their calls declare no URL
 * elicitation: agent-manager then answers the request's id
 * (`credentialOperation`) as its result, and the portal opens its own
 * credential form in place. Declared, agent-manager asks muster's caller to
 * open the form's page instead, which the portal would put to the person as
 * an external page in a new tab, and the call would end in an error after the
 * save. A new such tool belongs here.
 */
const CREDENTIAL_REQUEST_TOOLS: ReadonlySet<AgentManagerTool> = new Set([
  AGENT_MANAGER_TOOLS.setOrganizationModel,
  AGENT_MANAGER_TOOLS.replaceOrganizationCredential,
]);

/** `list_model_configs`' answer, as the client reads it. */
export type ListModelConfigsAnswer = {
  modelConfigs?: AgentManagerModelConfig[];
};

/**
 * agent-manager's tools on one installation, called as the signed-in person.
 *
 * The seam is the muster plugin's own client: `musterApi.callTool()` sends the
 * person's token for the installation's muster (the main-login token on the
 * home installation, the brokered one elsewhere) and muster runs the tool with
 * the person's own grant for the server — so the HelmRelease a create writes
 * names the person, not a ServiceAccount. No agent-manager URL, no REST client:
 * the portal knows agent-manager only as `x_agent-manager_<tool>` in muster.
 */
export class AgentManagerClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private splitUpdates?: Promise<boolean>;

  /**
   * Whether this agent-manager splits an update over `update_agent` (what an
   * agent is) and `update_agent_access` (what it can reach), as it does
   * since tool approval: `update_agent_access` can be described. Read once
   * per client. A failed read is an older agent-manager (one `update_agent`
   * takes everything), or a transient failure, after which a new one refuses
   * the single update in its own words before writing anything.
   */
  takesSplitUpdates(): Promise<boolean> {
    // A muster API that describes no tools (a reduced one) has none to ask.
    if (typeof this.musterApi.describeTool !== 'function') {
      return Promise.resolve(false);
    }
    this.splitUpdates ??= Promise.resolve()
      .then(() =>
        this.musterApi.describeTool(
          agentManagerToolName(AGENT_MANAGER_TOOLS.updateAgentAccess),
          this.installation,
        ),
      )
      .then(
        detail => Boolean(detail),
        error => {
          // Only a tool muster does not know is an older agent-manager; any
          // other failure is asked again next time, never remembered.
          if (isToolNotFound(error)) {
            return false;
          }
          this.splitUpdates = undefined;
          throw error;
        },
      );
    return this.splitUpdates;
  }

  private async call<T>(
    tool: AgentManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        agentManagerToolName(tool),
        args,
        this.installation,
        ...(CREDENTIAL_REQUEST_TOOLS.has(tool)
          ? [{ urlElicitation: false }]
          : []),
      );
    } catch (error) {
      throw classifyAgentManagerError(error);
    }
    // The proxy parses a JSON text payload for us; a tool that answered a
    // bare string (an older aggregator, a plain-text answer) is parsed here.
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        throw new Error(
          `agent-manager's ${tool} answered text, not JSON: ${result}`,
        );
      }
    }
    return result as T;
  }

  /** What this installation's agent-manager composes and can do. */
  getInfo(): Promise<AgentManagerInfo> {
    return this.call<AgentManagerInfo>(AGENT_MANAGER_TOOLS.getInfo, {});
  }

  /** The dry run: the manifests a create would apply, and every violation. */
  validateAgent(spec: AgentSpec): Promise<ValidateAgentResult> {
    return this.call<ValidateAgentResult>(AGENT_MANAGER_TOOLS.validateAgent, {
      ...spec,
    });
  }

  /** Applies the release as the person. */
  createAgent(spec: AgentSpec): Promise<CreateAgentResult> {
    return this.call<CreateAgentResult>(AGENT_MANAGER_TOOLS.createAgent, {
      ...spec,
    });
  }

  /**
   * Lands the manifests as a pull request instead (`mode: commit`,
   * giantswarm/agent-manager#24). Offered only when `get_info` reports the
   * `commit` capability.
   */
  commitAgent(spec: AgentSpec): Promise<CommitAgentResult> {
    return this.call<CommitAgentResult>(AGENT_MANAGER_TOOLS.createAgent, {
      ...spec,
      mode: 'commit',
    });
  }

  /** One verdict on the Agent's readiness on the Harness it names. */
  getAgentStatus(namespace: string, name: string): Promise<AgentStatus> {
    return this.call<AgentStatus>(AGENT_MANAGER_TOOLS.getAgentStatus, {
      namespace,
      name,
    });
  }

  /** The agent as agent-manager reads it: what an edit starts from. */
  getAgent(namespace: string, name: string): Promise<AgentManagerAgent> {
    return this.call<AgentManagerAgent>(AGENT_MANAGER_TOOLS.getAgent, {
      namespace,
      name,
    });
  }

  /** The ModelConfigs of a namespace — the values `modelConfig` may take. */
  async listModelConfigs(
    namespace: string,
  ): Promise<AgentManagerModelConfig[]> {
    const result = await this.call<ListModelConfigsAnswer>(
      AGENT_MANAGER_TOOLS.listModelConfigs,
      { namespace },
    );
    return result.modelConfigs ?? [];
  }

  /**
   * The EgressPolicies of a namespace, as the caller reads them — the names
   * `egressPolicyRefs` may take — each origin with its credential header's
   * name, never the Secret.
   */
  async listEgressPolicies(
    namespace: string,
  ): Promise<AgentManagerEgressPolicy[]> {
    const result = await this.call<{
      egressPolicies?: AgentManagerEgressPolicy[];
    }>(AGENT_MANAGER_TOOLS.listEgressPolicies, { namespace });
    return result.egressPolicies ?? [];
  }

  /**
   * The dry run of an update: the values and manifests agent-manager would
   * write for `update` — with `refreshSkills`, every git skill re-pinned to its
   * default-branch head — and every violation. Nothing is written. `commit`
   * answers as `commitUpdateAgent` would: an agent applied from git is
   * validated rather than refused with `gitops_owned`.
   */
  validateUpdate(
    update: AgentUpdate,
    mode: WriteMode = 'apply',
  ): Promise<ValidateAgentResult> {
    return this.call<ValidateAgentResult>(AGENT_MANAGER_TOOLS.validateAgent, {
      ...update,
      update: true,
      ...(mode === 'commit' ? { mode } : {}),
    });
  }

  /**
   * The writes of one update, in order: `update_agent` with everything on an
   * older agent-manager; on one with tool approval, `update_agent` with what
   * the agent is, then `update_agent_access` with what it can reach, each
   * only when it carries a field.
   */
  private async updateWrites(
    update: AgentUpdate,
  ): Promise<{ tool: AgentManagerTool; args: AgentUpdate }[]> {
    if (!(await this.takesSplitUpdates())) {
      return [{ tool: AGENT_MANAGER_TOOLS.updateAgent, args: update }];
    }
    const { describe, access } = splitAgentUpdate(update);
    // The precondition goes with the first write; each next one carries the
    // generation the one before it wrote (`chainGeneration`).
    if (update.expectedGeneration !== undefined) {
      const first = describe ?? access;
      if (first) {
        first.expectedGeneration = update.expectedGeneration;
      }
    }
    const writes: { tool: AgentManagerTool; args: AgentUpdate }[] = [];
    if (describe) {
      writes.push({ tool: AGENT_MANAGER_TOOLS.updateAgent, args: describe });
    }
    if (access) {
      writes.push({
        tool: AGENT_MANAGER_TOOLS.updateAgentAccess,
        args: access,
      });
    }
    // Nothing to change still answers the agent as it is.
    return writes.length > 0
      ? writes
      : [{ tool: AGENT_MANAGER_TOOLS.updateAgent, args: update }];
  }

  /**
   * Merges `update` into the release's values and writes it, as the person:
   * one write, or two on an agent-manager with tool approval. When the
   * second is refused after the first landed, the refusal says so.
   */
  async updateAgent(update: AgentUpdate): Promise<UpdateAgentResult> {
    const writes = await this.updateWrites(update);
    let merged: UpdateAgentResult | undefined;
    for (const write of writes) {
      let result: UpdateAgentResult;
      const args = merged
        ? chainGeneration(write.args, merged, update)
        : write.args;
      try {
        result = await this.call<UpdateAgentResult>(write.tool, { ...args });
      } catch (error) {
        throw merged ? partialWriteError(error, write.tool) : error;
      }
      merged = merged
        ? {
            ...result,
            before: merged.before,
            changed: [...new Set([...merged.changed, ...result.changed])],
            dropped: [...(merged.dropped ?? []), ...(result.dropped ?? [])],
            warnings: [...(merged.warnings ?? []), ...(result.warnings ?? [])],
            ...((merged.sessionsUpdated === false ||
              result.sessionsUpdated === false) && { sessionsUpdated: false }),
          }
        : result;
    }
    return merged!;
  }

  /**
   * Lands the update as a pull request in the owning GitOps repository instead
   * (`mode: commit`, giantswarm/agent-manager#24). Offered only when `get_info`
   * reports the `commit` capability. On an agent-manager with tool approval a
   * change to what the agent is and to what it can reach are a pull request
   * each: the earlier one is in `earlier`.
   */
  async commitUpdateAgent(update: AgentUpdate): Promise<CommitAgentResult> {
    const writes = await this.updateWrites(update);
    const results: CommitAgentResult[] = [];
    for (const write of writes) {
      try {
        results.push(
          await this.call<CommitAgentResult>(write.tool, {
            ...write.args,
            mode: 'commit',
          }),
        );
      } catch (error) {
        throw results.length > 0 ? partialWriteError(error, write.tool) : error;
      }
    }
    const last = results[results.length - 1];
    return results.length > 1
      ? { ...last, earlier: results.slice(0, -1) }
      : last;
  }

  /**
   * `set_agent_approval`: the settings on entries of the agent's tool list
   * and its default — the only write that lets the agent skip a connector's
   * `Ask` (agent-manager checks the person is that connector's admin and
   * records the grant). Live only for a grant: a release in git carries none.
   */
  setAgentApproval(
    namespace: string,
    name: string,
    change: AgentApprovalChange,
    mode: WriteMode = 'apply',
  ): Promise<SetAgentApprovalResult & CommitAgentResult> {
    return this.call<SetAgentApprovalResult & CommitAgentResult>(
      AGENT_MANAGER_TOOLS.setAgentApproval,
      {
        namespace,
        name,
        ...change,
        ...(mode === 'commit' ? { mode } : {}),
      },
    );
  }

  /**
   * `list_approval_grants`: the agents of a namespace that may skip a
   * connector's `Ask`, and who let them. Read as the person.
   */
  async listApprovalGrants(options: {
    namespace?: string;
    server?: string;
  }): Promise<AgentApprovalGrant[]> {
    const result = await this.call<{ grants?: AgentApprovalGrant[] }>(
      AGENT_MANAGER_TOOLS.listApprovalGrants,
      {
        ...(options.namespace && { namespace: options.namespace }),
        ...(options.server && { server: options.server }),
      },
    );
    return result.grants ?? [];
  }

  /**
   * The dry run of `commitUpdateAgent`: the merged values and the pull request
   * it would open, nothing opened. Unlike `validateUpdate` it reads the
   * repository's base branch as the person, so it refuses up front what the
   * commit would, such as a release whose file is not in agent-manager's
   * directory.
   */
  async dryRunCommitUpdateAgent(
    update: AgentUpdate,
  ): Promise<UpdateAgentCommitDryRun> {
    // On an agent-manager with tool approval, the write that carries what the
    // agent can reach (skills, Harness) is the one that would be refused.
    const writes = await this.updateWrites(update);
    const write = writes[writes.length - 1];
    return this.call<UpdateAgentCommitDryRun>(write.tool, {
      ...write.args,
      mode: 'commit',
      dryRun: true,
    });
  }

  /**
   * Deletes the agent's HelmRelease (helm-controller uninstalls the Agent
   * and the agent's RemoteMCPServer with it) and the shared OCIRepository only
   * when nothing else references it. Never with `force`: a GitOps-owned or
   * suspended release is agent-manager's refusal to show, not ours to override.
   */
  deleteAgent(namespace: string, name: string): Promise<DeleteAgentResult> {
    return this.call<DeleteAgentResult>(AGENT_MANAGER_TOOLS.deleteAgent, {
      namespace,
      name,
    });
  }

  /**
   * Removes the agent's files from the owning GitOps repository as a pull
   * request instead (`mode: commit`, giantswarm/agent-manager#24). Offered only
   * when `get_info` reports the `commit` capability.
   */
  commitDeleteAgent(
    namespace: string,
    name: string,
  ): Promise<CommitAgentResult> {
    return this.call<CommitAgentResult>(AGENT_MANAGER_TOOLS.deleteAgent, {
      namespace,
      name,
      mode: 'commit',
    });
  }

  /**
   * Starts a session with an agent, as the person: one `start_session`, the
   * only way a session starts, so every surface passes the same checks (a
   * workspace grant's among them). Without `message` it only creates the
   * session. `requestId` makes a retry answer the session the first attempt
   * created.
   */
  async startSession(
    request: StartSessionRequest,
  ): Promise<StartSessionResult & { sessionId: string }> {
    const result = await this.call<StartSessionResult>(
      AGENT_MANAGER_TOOLS.startSession,
      {
        namespace: request.namespace,
        name: request.name,
        ...(request.message ? { message: request.message } : {}),
        requestId: request.requestId,
        ...(request.sessionName ? { sessionName: request.sessionName } : {}),
        // Without a grant the session starts without a workspace, said
        // explicitly: a call naming neither starts in the agent's default.
        ...(request.workspaceGrant
          ? { workspaceGrant: request.workspaceGrant }
          : { noWorkspace: true }),
        ...toolchainArgs(request.toolchains),
      },
    );
    // The id is where the person is taken next: an answer without one has
    // nowhere to go, so it fails rather than resolving into a broken link.
    const sessionId = result?.session?.id;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error(
        "agent-manager's start_session answered without a session id.",
      );
    }
    return { ...result, sessionId };
  }

  /**
   * The organizations the person manages or belongs to, each with what they
   * may do with it, asked with their own token.
   */
  async listOrganizations(): Promise<OrganizationListing> {
    const result = await this.call<Partial<OrganizationListing>>(
      AGENT_MANAGER_TOOLS.listOrganizations,
      {},
    );
    return { ...result, organizations: result.organizations ?? [] };
  }

  /**
   * One organization, by its parent namespace and name, and what a delete
   * would erase. agent-manager answers the organization's fields and
   * `erases` side by side.
   */
  async getOrganization(
    parent: string,
    name: string,
  ): Promise<OrganizationDetails> {
    const { erases, ...organization } = await this.call<
      AgentPlatformOrganization & { erases?: OrganizationErasure }
    >(AGENT_MANAGER_TOOLS.getOrganization, { namespace: parent, name });
    return { organization, ...(erases ? { erases } : {}) };
  }

  /**
   * Deletes an organization as the person. Without `confirm` it opens the
   * pull request that removes it from git (`mode: commit`); with `confirm`
   * (`parent/name`, as typed) it erases it.
   */
  deleteOrganization(request: {
    parent: string;
    name: string;
    confirm?: string;
    mode?: 'commit';
  }): Promise<OrganizationDeleteResult> {
    return this.call<OrganizationDeleteResult>(
      AGENT_MANAGER_TOOLS.deleteOrganization,
      {
        namespace: request.parent,
        name: request.name,
        ...(request.confirm ? { confirm: request.confirm } : {}),
        ...(request.mode ? { mode: request.mode } : {}),
      },
    );
  }

  /** An organization's members: groups first, each with its role. */
  async listOrganizationMembers(
    namespace: string,
  ): Promise<OrganizationMembers> {
    const result = await this.call<Partial<OrganizationMembers>>(
      AGENT_MANAGER_TOOLS.listOrganizationMembers,
      { namespace },
    );
    return { namespace, members: result.members ?? [] };
  }

  /** Binds a group (offered first) or a person to a role, as the person. */
  addOrganizationMember(request: MemberRequest): Promise<MemberResult> {
    return this.call<MemberResult>(AGENT_MANAGER_TOOLS.addOrganizationMember, {
      ...request,
    });
  }

  /**
   * Unbinds a group or a person from a role, as the person. Admission keeps
   * the last admin of `organization-admins`: that refusal comes back as
   * agent-manager's error, with the way out in its message.
   */
  removeOrganizationMember(request: MemberRequest): Promise<MemberResult> {
    return this.call<MemberResult>(
      AGENT_MANAGER_TOOLS.removeOrganizationMember,
      { ...request },
    );
  }

  /** An organization's connectors (RemoteMCPServers). */
  async listOrganizationConnectors(
    namespace: string,
  ): Promise<OrganizationConnector[]> {
    const result = await this.call<{ connectors?: OrganizationConnector[] }>(
      AGENT_MANAGER_TOOLS.listOrganizationConnectors,
      { namespace },
    );
    return result.connectors ?? [];
  }

  /**
   * Creates or changes an organization's model. Never takes a key: a
   * missing one comes back as a credential request (`credentialOperation`).
   * Callers check the installation's tool first (`useEnsureModelOperations`).
   */
  async setOrganizationModel(
    request: OrganizationModelRequest,
  ): Promise<CredentialResourceResult> {
    const endpointProblem = modelEndpointProblem(request.endpoint ?? '');
    if (endpointProblem) throw new Error(endpointProblem);
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.setOrganizationModel,
      { ...request },
    );
  }

  /**
   * Deletes a model as the caller. With `dryRun`, agent-manager checks the
   * deletion as the caller and writes nothing: its answer is whether the
   * caller may delete the model.
   */
  deleteModel(
    namespace: string,
    name: string,
    options: { dryRun?: boolean; mode?: 'commit' } = {},
  ): Promise<CredentialResourceResult> {
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.deleteOrganizationObject,
      {
        namespace,
        name,
        kind: 'model',
        ...(options.dryRun ? { dryRun: true } : {}),
        ...(options.mode ? { mode: options.mode } : {}),
      },
    );
  }

  /**
   * Asks for a new value of one key of an organization's credential Secret
   * (`replace_organization_credential`): a credential request that writes
   * the Secret only, for every object that reads it.
   */
  replaceOrganizationCredential(
    request: OrganizationCredentialReplacement,
  ): Promise<CredentialResourceResult> {
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.replaceOrganizationCredential,
      { ...request },
    );
  }
}
