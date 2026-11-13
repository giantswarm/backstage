// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { SKILL_MANAGER_SERVER } from '../../../lib/skillManager';

/** skill-manager's tools in fixture mode. */
export const skillManager: FixtureMcpServer = {
  server: SKILL_MANAGER_SERVER,
  tools: {},
};
