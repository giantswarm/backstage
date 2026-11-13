// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import { CLUSTER_MANAGER_SERVER } from '../../../lib/clusterManager';

/** cluster-manager's tools in fixture mode. */
export const clusterManager: FixtureMcpServer = {
  server: CLUSTER_MANAGER_SERVER,
  tools: {},
};
