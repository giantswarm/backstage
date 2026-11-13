// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  WORKSPACE_MANAGER_SERVER,
  WORKSPACE_MANAGER_TOOLS,
} from '../../../lib/workspaceManager';
import type { ListWorkspacesAnswer } from '../../WorkspaceManagerClient';

/** workspace-manager's tools in fixture mode: no workspaces. */
export const workspaceManager: FixtureMcpServer = {
  server: WORKSPACE_MANAGER_SERVER,
  tools: {
    [WORKSPACE_MANAGER_TOOLS.listWorkspaces]: (): ListWorkspacesAnswer => ({
      workspaces: [],
      organizations: [],
    }),
  },
};
