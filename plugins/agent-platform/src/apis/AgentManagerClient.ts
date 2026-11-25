// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- agent-manager is reached through Muster.
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
import { modelEndpointProblem } from '../lib/modelEndpoint';
import { MODEL_CONFIG_NAMESPACE } from '../lib/modelConfigs';
import { PLATFORM_TENANT_NAMESPACE } from '../lib/tenants';
import {
  modelNamespaceRefused,
  organizationOfNamespace,
  type OrganizationReads,
} from '../lib/organizations';
import type {
  MemberRequest,
  MemberResult,
  OrganizationListing,
  OrganizationConnector,
  OrganizationCredentialReplacement,
  OrganizationModelRequest,
  OrganizationSummary,
  OrganizationAdminsUpdate,
  OrganizationCreateRequest,
  OrganizationCreateResult,
  OrganizationDeleteResult,
  OrganizationUpdateResult,
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

/**
 * `erases` with every list present: agent-manager answers them `null` when
 * the organization has no namespace yet and only organization-operator's
 * namespace goes with it. `sessions` keeps its `null`, which says they could
 * not be counted.
 */
function erasureOf(erases: OrganizationErasure): OrganizationErasure {
  return {
    ...erases,
    namespace: erases.namespace ?? '',
    agents: erases.agents ?? [],
    helmReleases: erases.helmReleases ?? [],
    models: erases.models ?? [],
    connectors: erases.connectors ?? [],
    egressPolicies: erases.egressPolicies ?? [],
    credentials: erases.credentials ?? [],
    members: erases.members ?? [],
  };
}

/** How an agent tool is told where it acts. */
type AgentPlace = { organization: string } | { namespace: string };

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
    reads?: OrganizationReads,
  ) {
    this.reads = reads ?? {
      info: () => this.getInfo(),
      listing: () => this.listOrganizations(),
    };
  }

  /**
   * `get_info` and `list_organizations`, which tell an organization's
   * namespace and the installation's own; cached where the caller has a
   * cache, read afresh otherwise.
   */
  private readonly reads: OrganizationReads;

  /** The organization's name whose namespace `namespace` is, if any. */
  private organizationOf(namespace: string): Promise<string | undefined> {
    return organizationOfNamespace(namespace, this.reads);
  }

  /**
   * Where an agent tool acts on `namespace`: an organization's namespace by
   * the organization's name, as agent-manager takes it; any other namespace
   * as it is. A failed read of the organizations fails the call with its
   * own reason: sent as it is, the namespace would come back refused in
   * words about the tool's arguments.
   */
  private async agentPlace(namespace: string): Promise<AgentPlace> {
    if (!namespace || namespace === PLATFORM_TENANT_NAMESPACE) {
      return { namespace };
    }
    const organization = await this.organizationOf(namespace);
    return organization ? { organization } : { namespace };
  }

  /**
   * Where a model tool acts on `namespace`: no organization for the
   * installation's models, in the platform namespace `get_info` names
   * (`namespaces.default`; `kagent` where it names none), the organization's
   * name for an organization's namespace (`known`, when the caller knows
   * it). Any other namespace is refused before the call: without an
   * organization agent-manager acts on its own platform namespace's models,
   * whatever namespace the portal meant.
   */
  private async modelPlace(
    namespace: string,
    known?: string,
  ): Promise<{ organization?: string }> {
    if (known) {
      return { organization: known };
    }
    const info = await this.reads.info();
    if (namespace === (info.namespaces?.default || MODEL_CONFIG_NAMESPACE)) {
      return {};
    }
    const organization = await this.organizationOf(namespace);
    if (!organization) {
      throw new Error(modelNamespaceRefused(namespace));
    }
    return { organization };
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
  async validateAgent(spec: AgentSpec): Promise<ValidateAgentResult> {
    return this.call<ValidateAgentResult>(
      AGENT_MANAGER_TOOLS.validateAgent,
      await this.placed(spec),
    );
  }

  /** Applies the release as the person. */
  async createAgent(spec: AgentSpec): Promise<CreateAgentResult> {
    return this.call<CreateAgentResult>(
      AGENT_MANAGER_TOOLS.createAgent,
      await this.placed(spec),
    );
  }

  /** An agent tool's arguments with `namespace` as {@link agentPlace} says. */
  private async placed<T extends { namespace: string }>(
    args: T,
  ): Promise<Omit<T, 'namespace'> & AgentPlace> {
    const { namespace, ...rest } = args;
    return { ...rest, ...(await this.agentPlace(namespace)) };
  }

  /**
   * Lands the manifests as a pull request instead (`mode: commit`,
   * giantswarm/agent-manager#24). Offered only when `get_info` reports the
   * `commit` capability.
   */
  async commitAgent(spec: AgentSpec): Promise<CommitAgentResult> {
    return this.call<CommitAgentResult>(AGENT_MANAGER_TOOLS.createAgent, {
      ...(await this.placed(spec)),
      mode: 'commit',
    });
  }

  /** One verdict on the Agent's readiness on the Harness it names. */
  async getAgentStatus(namespace: string, name: string): Promise<AgentStatus> {
    return this.call<AgentStatus>(
      AGENT_MANAGER_TOOLS.getAgentStatus,
      await this.placed({ namespace, name }),
    );
  }

  /** The agent as agent-manager reads it: what an edit starts from. */
  async getAgent(namespace: string, name: string): Promise<AgentManagerAgent> {
    return this.call<AgentManagerAgent>(
      AGENT_MANAGER_TOOLS.getAgent,
      await this.placed({ namespace, name }),
    );
  }

  /** The ModelConfigs of a namespace — the values `modelConfig` may take. */
  async listModelConfigs(
    namespace: string,
  ): Promise<AgentManagerModelConfig[]> {
    const result = await this.call<ListModelConfigsAnswer>(
      AGENT_MANAGER_TOOLS.listModelConfigs,
      await this.agentPlace(namespace),
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
    }>(
      AGENT_MANAGER_TOOLS.listEgressPolicies,
      await this.agentPlace(namespace),
    );
    return result.egressPolicies ?? [];
  }

  /**
   * The dry run of an update: the values and manifests agent-manager would
   * write for `update` — with `refreshSkills`, every git skill re-pinned to its
   * default-branch head — and every violation. Nothing is written. `commit`
   * answers as `commitUpdateAgent` would: an agent applied from git is
   * validated rather than refused with `gitops_owned`.
   */
  async validateUpdate(
    update: AgentUpdate,
    mode: WriteMode = 'apply',
  ): Promise<ValidateAgentResult> {
    return this.call<ValidateAgentResult>(AGENT_MANAGER_TOOLS.validateAgent, {
      ...(await this.placed(update)),
      update: true,
      ...(mode === 'commit' ? { mode } : {}),
    });
  }

  /** Merges `update` into the release's values and writes it, as the person. */
  async updateAgent(update: AgentUpdate): Promise<UpdateAgentResult> {
    return this.call<UpdateAgentResult>(
      AGENT_MANAGER_TOOLS.updateAgent,
      await this.placed(update),
    );
  }

  /**
   * Lands the update as a pull request in the owning GitOps repository instead
   * (`mode: commit`, giantswarm/agent-manager#24). Offered only when `get_info`
   * reports the `commit` capability.
   */
  async commitUpdateAgent(update: AgentUpdate): Promise<CommitAgentResult> {
    return this.call<CommitAgentResult>(AGENT_MANAGER_TOOLS.updateAgent, {
      ...(await this.placed(update)),
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
  async dryRunCommitUpdateAgent(
    update: AgentUpdate,
  ): Promise<UpdateAgentCommitDryRun> {
    return this.call<UpdateAgentCommitDryRun>(AGENT_MANAGER_TOOLS.updateAgent, {
      ...(await this.placed(update)),
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
  async deleteAgent(
    namespace: string,
    name: string,
  ): Promise<DeleteAgentResult> {
    return this.call<DeleteAgentResult>(
      AGENT_MANAGER_TOOLS.deleteAgent,
      await this.placed({ namespace, name }),
    );
  }

  /**
   * Removes the agent's files from the owning GitOps repository as a pull
   * request instead (`mode: commit`, giantswarm/agent-manager#24). Offered only
   * when `get_info` reports the `commit` capability.
   */
  async commitDeleteAgent(
    namespace: string,
    name: string,
  ): Promise<CommitAgentResult> {
    return this.call<CommitAgentResult>(AGENT_MANAGER_TOOLS.deleteAgent, {
      ...(await this.placed({ namespace, name })),
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
        ...(await this.agentPlace(request.namespace)),
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
   * One organization, by its name, and what a delete would erase.
   * agent-manager answers the organization's fields and `erases` side by
   * side.
   */
  async getOrganization(name: string): Promise<OrganizationDetails> {
    const { erases, ...organization } = await this.call<
      OrganizationSummary & { erases?: OrganizationErasure }
    >(AGENT_MANAGER_TOOLS.getOrganization, { name });
    return {
      organization,
      ...(erases ? { erases: erasureOf(erases) } : {}),
    };
  }

  /**
   * Creates an organization as the person: one `Organization` with the
   * Agent Platform on and its admins in `spec.admins`. agent-manager writes
   * no RoleBinding and does not wait for the operator.
   */
  createOrganization(
    request: OrganizationCreateRequest,
  ): Promise<OrganizationCreateResult> {
    return this.call<OrganizationCreateResult>(
      AGENT_MANAGER_TOOLS.createOrganization,
      {
        name: request.name,
        ...(request.displayName ? { displayName: request.displayName } : {}),
        ...(request.adminGroups?.length
          ? { adminGroups: request.adminGroups }
          : {}),
        ...(request.adminUsers?.length
          ? { adminUsers: request.adminUsers }
          : {}),
      },
    );
  }

  /**
   * Changes an organization's admins as the person: each kind given
   * replaces that kind of `spec.admins`, `[]` removes them, and a kind left
   * out stays.
   */
  updateOrganizationAdmins(
    request: OrganizationAdminsUpdate,
  ): Promise<OrganizationUpdateResult> {
    return this.call<OrganizationUpdateResult>(
      AGENT_MANAGER_TOOLS.updateOrganization,
      {
        name: request.name,
        ...(request.adminGroups ? { adminGroups: request.adminGroups } : {}),
        ...(request.adminUsers ? { adminUsers: request.adminUsers } : {}),
        ...(request.mode ? { mode: request.mode } : {}),
      },
    );
  }

  /**
   * Deletes an organization as the person. Without `confirm` it opens the
   * pull request that removes it from git (`mode: commit`); with `confirm`
   * (its name, as typed) it erases it.
   */
  deleteOrganization(request: {
    name: string;
    confirm?: string;
    mode?: 'commit';
  }): Promise<OrganizationDeleteResult> {
    return this.call<OrganizationDeleteResult>(
      AGENT_MANAGER_TOOLS.deleteOrganization,
      {
        name: request.name,
        ...(request.confirm ? { confirm: request.confirm } : {}),
        ...(request.mode ? { mode: request.mode } : {}),
      },
    );
  }

  /**
   * An organization's members, by the organization's name: groups first,
   * each with its role.
   */
  async listOrganizationMembers(
    organization: string,
  ): Promise<OrganizationMembers> {
    const result = await this.call<Partial<OrganizationMembers>>(
      AGENT_MANAGER_TOOLS.listOrganizationMembers,
      { organization },
    );
    return {
      organization: result.organization ?? organization,
      members: result.members ?? [],
    };
  }

  /**
   * Binds a group (offered first) or a person to a role in an organization,
   * by its name, as the person.
   */
  addOrganizationMember(request: MemberRequest): Promise<MemberResult> {
    return this.call<MemberResult>(AGENT_MANAGER_TOOLS.addOrganizationMember, {
      ...request,
    });
  }

  /**
   * Unbinds a group or a person from the editor or user role, as the
   * person. An admin stays one: the admins are the `Organization`'s
   * `spec.admins`, and agent-manager's `note` says so.
   */
  removeOrganizationMember(request: MemberRequest): Promise<MemberResult> {
    return this.call<MemberResult>(
      AGENT_MANAGER_TOOLS.removeOrganizationMember,
      { ...request },
    );
  }

  /** An organization's connectors (RemoteMCPServers), by its name. */
  async listOrganizationConnectors(
    organization: string,
  ): Promise<OrganizationConnector[]> {
    const result = await this.call<{ connectors?: OrganizationConnector[] }>(
      AGENT_MANAGER_TOOLS.listOrganizationConnectors,
      { organization },
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
    const { namespace, organization, ...rest } = request;
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.setOrganizationModel,
      { ...(await this.modelPlace(namespace, organization)), ...rest },
    );
  }

  /**
   * Deletes a model as the caller. With `dryRun`, agent-manager checks the
   * deletion as the caller and writes nothing: its answer is whether the
   * caller may delete the model.
   */
  async deleteModel(
    namespace: string,
    name: string,
    options: {
      dryRun?: boolean;
      mode?: 'commit';
      /** The organization of `namespace`, by its name, when known. */
      organization?: string;
    } = {},
  ): Promise<CredentialResourceResult> {
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.deleteOrganizationObject,
      {
        ...(await this.modelPlace(namespace, options.organization)),
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
  async replaceOrganizationCredential(
    request: OrganizationCredentialReplacement,
  ): Promise<CredentialResourceResult> {
    const { namespace, organization, ...rest } = request;
    return this.call<CredentialResourceResult>(
      AGENT_MANAGER_TOOLS.replaceOrganizationCredential,
      { ...(await this.modelPlace(namespace, organization)), ...rest },
    );
  }
}
