// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { WORKSPACE_MANAGER_SERVER } from '../../../lib/workspaceManager';

/** workspace-manager's tools in fixture mode. */
export const workspaceManager: FixtureMcpServer = {
  server: WORKSPACE_MANAGER_SERVER,
  tools: {},
};
