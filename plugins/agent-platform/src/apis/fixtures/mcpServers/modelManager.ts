// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { MODEL_MANAGER_SERVER } from '../../../lib/modelManagerBackends';

/** model-manager's tools in fixture mode. */
export const modelManager: FixtureMcpServer = {
  server: MODEL_MANAGER_SERVER,
  tools: {},
};
