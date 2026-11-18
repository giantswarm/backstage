// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { agentManager } from './agentManager';
import { clusterManager } from './clusterManager';
import { modelManager } from './modelManager';
import { skillManager } from './skillManager';
import { toolchainManager } from './toolchainManager';
import { workspaceManager } from './workspaceManager';

/**
 * The MCP servers behind muster that the agent-platform pages call, in
 * fixture mode: one module per server, each a handler per tool.
 */
export const agentPlatformFixtureMcpServers: FixtureMcpServer[] = [
  agentManager,
  clusterManager,
  modelManager,
  skillManager,
  toolchainManager,
  workspaceManager,
];
