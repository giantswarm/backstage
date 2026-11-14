// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  TOOLCHAIN_MANAGER_SERVER,
  TOOLCHAIN_MANAGER_TOOLS,
  type ToolchainList,
  type ToolchainSourceList,
} from '../../../lib/toolchainManager';

/** toolchain-manager's tools in fixture mode: no sources, no toolchains. */
export const toolchainManager: FixtureMcpServer = {
  server: TOOLCHAIN_MANAGER_SERVER,
  tools: {
    [TOOLCHAIN_MANAGER_TOOLS.listToolchains]: (): ToolchainList => ({
      toolchains: [],
    }),
    [TOOLCHAIN_MANAGER_TOOLS.listSources]: (): ToolchainSourceList => ({
      sources: [],
    }),
  },
};
