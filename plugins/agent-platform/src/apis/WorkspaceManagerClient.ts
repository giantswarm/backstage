import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  WORKSPACE_MANAGER_TOOLS,
  WorkspaceManagerError,
  classifyWorkspaceManagerError,
  workspaceManagerToolName,
  type CreateWorkspaceInput,
  type DeleteWorkspaceResult,
  type ListRepositoriesInput,
  type PreviewWorkspaceInput,
  type RepositoriesPage,
  type SyncWorkspaceResult,
  type UpdateWorkspaceInput,
  type Workspace,
  type WorkspaceAuthorization,
  type WorkspaceDetail,
  type WorkspaceList,
  type WorkspaceManagerTool,
  type WorkspacePreview,
  type WorkspaceProvider,
} from '../lib/workspaceManager';

/**
 * workspace-manager's tools on one installation, called as the signed-in
 * person.
 *
 * The seam is the muster plugin's own client: `musterApi.callTool()` sends the
 * person's token for the installation's muster and muster forwards the
 * person's identity, whose groups workspace-manager checks the Organization
 * membership against, and whose subject keys the person's provider sign-ins.
 * No workspace-manager URL, no REST client, no proxy route: the portal knows
 * workspace-manager only as `x_workspace-manager_<tool>` in muster. Every
 * failure is a {@link WorkspaceManagerError} of its kind.
 */
export class WorkspaceManagerClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private async call<T>(
    tool: WorkspaceManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        workspaceManagerToolName(tool),
        args,
        this.installation,
      );
    } catch (error) {
      throw classifyWorkspaceManagerError(error);
    }
    // The proxy parses the tool's JSON for us; a bare string is a JSON text
    // the proxy left alone, or prose where the data was expected.
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        throw new WorkspaceManagerError(
          'failed',
          `workspace-manager's ${tool} answered text, not JSON: ${result}`,
        );
      }
    }
    return result as T;
  }

  /**
   * The workspaces of the person's Organizations, or of one of them, and the
   * person's Organizations whatever the filter.
   */
  async listWorkspaces(organization?: string): Promise<WorkspaceList> {
    const result = await this.call<{
      workspaces?: Workspace[];
      organizations?: string[];
    }>(
      WORKSPACE_MANAGER_TOOLS.listWorkspaces,
      organization ? { organization } : {},
    );
    const workspaces = result.workspaces ?? [];
    return {
      workspaces,
      organizations:
        result.organizations ??
        [...new Set(workspaces.map(w => w.organization))].sort((a, b) =>
          a.localeCompare(b),
        ),
    };
  }

  /** One workspace with its mirrors, storage and Session directories. */
  getWorkspace(workspace: string): Promise<WorkspaceDetail> {
    return this.call<WorkspaceDetail>(WORKSPACE_MANAGER_TOOLS.getWorkspace, {
      workspace,
    });
  }

  /** Creates the workspace; it syncs after the save and then on its cycle. */
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    return this.call<Workspace>(WORKSPACE_MANAGER_TOOLS.createWorkspace, {
      ...input,
    });
  }

  /** Replaces the sources, and the cycle and sizing when given. */
  updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace> {
    return this.call<Workspace>(WORKSPACE_MANAGER_TOOLS.updateWorkspace, {
      ...input,
    });
  }

  /** Stops the sync; no new Session starts on it. */
  deleteWorkspace(workspace: string): Promise<DeleteWorkspaceResult> {
    return this.call<DeleteWorkspaceResult>(
      WORKSPACE_MANAGER_TOOLS.deleteWorkspace,
      { workspace },
    );
  }

  /** Sync now, ahead of the cycle (after the running sync, if any). */
  syncWorkspace(workspace: string): Promise<SyncWorkspaceResult> {
    return this.call<SyncWorkspaceResult>(
      WORKSPACE_MANAGER_TOOLS.syncWorkspace,
      { workspace },
    );
  }

  /** One page of an owner's repositories, searched and filtered, for the picker. */
  listRepositories(input: ListRepositoriesInput): Promise<RepositoriesPage> {
    return this.call<RepositoriesPage>(
      WORKSPACE_MANAGER_TOOLS.listRepositories,
      { ...input },
    );
  }

  /** What a workspace, or a draft, selects now. */
  previewWorkspace(input: PreviewWorkspaceInput): Promise<WorkspacePreview> {
    return this.call<WorkspacePreview>(
      WORKSPACE_MANAGER_TOOLS.previewWorkspace,
      { ...input },
    );
  }

  /**
   * The access check before a Session starts. Refused and connect_required
   * are answers, not failures: `authorizationError` turns them into the
   * error a Session start shows.
   */
  authorizeWorkspace(workspace: string): Promise<WorkspaceAuthorization> {
    return this.call<WorkspaceAuthorization>(
      WORKSPACE_MANAGER_TOOLS.authorizeWorkspace,
      { workspace },
    );
  }

  /** The installation's provider instances, with the person's App grant. */
  async listProviders(): Promise<WorkspaceProvider[]> {
    const result = await this.call<{ providers?: WorkspaceProvider[] }>(
      WORKSPACE_MANAGER_TOOLS.listProviders,
      {},
    );
    return result.providers ?? [];
  }
}
