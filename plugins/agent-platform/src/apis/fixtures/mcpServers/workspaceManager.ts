// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  WORKSPACE_MANAGER_SERVER,
  WORKSPACE_MANAGER_TOOLS,
  type CreateWorkspaceInput,
  type ListRepositoriesInput,
  type PreviewWorkspaceInput,
  type UpdateWorkspaceInput,
} from '../../../lib/workspaceManager';
import type { ListWorkspacesAnswer } from '../../WorkspaceManagerClient';
import {
  workspaceManagerFixtureState,
  type WorkspaceManagerFixtureState,
} from '../workspaceManagerFixtureState';
import { asJson, text } from './jsonTools';

/**
 * workspace-manager's tools in fixture mode, on `state` (the shared one by
 * default): the workspaces of the data set, and every write kept in memory
 * until the page reloads.
 */
export function workspaceManagerFixtureServer(
  state: () => WorkspaceManagerFixtureState = workspaceManagerFixtureState,
): FixtureMcpServer {
  const tools: FixtureMcpServer['tools'] = {
    [WORKSPACE_MANAGER_TOOLS.listWorkspaces]: (
      args,
      { installation },
    ): ListWorkspacesAnswer =>
      state().listWorkspaces(
        installation,
        text(args, 'organization') || undefined,
      ),
    [WORKSPACE_MANAGER_TOOLS.getWorkspace]: (args, { installation }) =>
      state().getWorkspace(installation, text(args, 'workspace')),
    [WORKSPACE_MANAGER_TOOLS.createWorkspace]: (args, { installation }) =>
      state().createWorkspace(installation, args as CreateWorkspaceInput),
    [WORKSPACE_MANAGER_TOOLS.updateWorkspace]: (args, { installation }) =>
      state().updateWorkspace(installation, args as UpdateWorkspaceInput),
    [WORKSPACE_MANAGER_TOOLS.deleteWorkspace]: (args, { installation }) =>
      state().deleteWorkspace(installation, text(args, 'workspace')),
    [WORKSPACE_MANAGER_TOOLS.syncWorkspace]: (args, { installation }) =>
      state().syncWorkspace(installation, text(args, 'workspace')),
    [WORKSPACE_MANAGER_TOOLS.listRepositories]: (args, { installation }) =>
      state().listRepositories(installation, args as ListRepositoriesInput),
    [WORKSPACE_MANAGER_TOOLS.previewWorkspace]: (args, { installation }) =>
      state().previewWorkspace(installation, args as PreviewWorkspaceInput),
    [WORKSPACE_MANAGER_TOOLS.authorizeWorkspace]: (args, { installation }) =>
      state().authorizeWorkspace(installation, text(args, 'workspace')),
    [WORKSPACE_MANAGER_TOOLS.listProviders]: () => ({
      providers: state().listProviders(),
    }),
    [WORKSPACE_MANAGER_TOOLS.listOwners]: (args, { installation }) => ({
      owners: state().listOwners(installation, {
        organization: text(args, 'organization'),
        provider: text(args, 'provider'),
      }),
    }),
  };
  return { server: WORKSPACE_MANAGER_SERVER, tools: asJson(tools) };
}

/** workspace-manager's tools in fixture mode. */
export const workspaceManager: FixtureMcpServer =
  workspaceManagerFixtureServer();
