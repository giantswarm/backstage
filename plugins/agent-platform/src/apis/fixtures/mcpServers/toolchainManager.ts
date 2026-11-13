// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { TOOLCHAIN_MANAGER_SERVER } from '../../../lib/toolchainManager';

/** toolchain-manager's tools in fixture mode. */
export const toolchainManager: FixtureMcpServer = {
  server: TOOLCHAIN_MANAGER_SERVER,
  tools: {},
};
