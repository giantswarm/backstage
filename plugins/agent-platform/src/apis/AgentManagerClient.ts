import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  AGENT_MANAGER_TOOLS,
  agentManagerToolName,
  classifyAgentManagerError,
  type AgentManagerAgent,
  type AgentManagerInfo,
  type AgentManagerModelConfig,
  type AgentManagerTool,
  type AgentSpec,
  type AgentStatus,
  type AgentUpdate,
  type CommitAgentResult,
  type CreateAgentResult,
  type DeleteAgentResult,
  type UpdateAgentResult,
  type ValidateAgentResult,
} from '../lib/agentManager';

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

  /** One verdict on the template's readiness on the platform Harness. */
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
   * The dry run of an update: the values and manifests agent-manager would
   * write for `update` — with `refreshSkills`, every git skill re-pinned to its
   * default-branch head — and every violation. Nothing is written.
   */
  validateUpdate(update: AgentUpdate): Promise<ValidateAgentResult> {
    return this.call<ValidateAgentResult>(AGENT_MANAGER_TOOLS.validateAgent, {
      ...update,
      update: true,
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
   * Deletes the agent's HelmRelease (helm-controller uninstalls the template
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
}
