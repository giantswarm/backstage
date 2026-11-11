import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  AGENT_MANAGER_TOOLS,
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
    const result = await this.call<{
      modelConfigs?: AgentManagerModelConfig[];
    }>(AGENT_MANAGER_TOOLS.listModelConfigs, { namespace });
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

  /** Merges `update` into the release's values and writes it, as the person. */
  updateAgent(update: AgentUpdate): Promise<UpdateAgentResult> {
    return this.call<UpdateAgentResult>(AGENT_MANAGER_TOOLS.updateAgent, {
      ...update,
    });
  }

  /**
   * Lands the update as a pull request in the owning GitOps repository instead
   * (`mode: commit`, giantswarm/agent-manager#24). Offered only when `get_info`
   * reports the `commit` capability.
   */
  commitUpdateAgent(update: AgentUpdate): Promise<CommitAgentResult> {
    return this.call<CommitAgentResult>(AGENT_MANAGER_TOOLS.updateAgent, {
      ...update,
      mode: 'commit',
    });
  }

  /**
   * The dry run of `commitUpdateAgent`: the merged values and the pull request
   * it would open, nothing opened. Unlike `validateUpdate` it reads the
   * repository's base branch as the person, so it refuses up front what the
   * commit would, such as a release whose file is not in agent-manager's
   * directory.
   */
  dryRunCommitUpdateAgent(
    update: AgentUpdate,
  ): Promise<UpdateAgentCommitDryRun> {
    return this.call<UpdateAgentCommitDryRun>(AGENT_MANAGER_TOOLS.updateAgent, {
      ...update,
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
   */
  setOrganizationModel(
    request: OrganizationModelRequest,
  ): Promise<CredentialResourceResult> {
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.setOrganizationModel,
      { ...request },
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
