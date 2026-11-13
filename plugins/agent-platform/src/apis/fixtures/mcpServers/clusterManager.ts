// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  CLUSTER_MANAGER_SERVER,
  CLUSTER_MANAGER_TOOLS,
  type ClusterManagerInfo,
} from '../../../lib/clusterManager';

const info: ClusterManagerInfo = {
  version: '1.0.0-fixture',
  modes: { apply: false, commit: false },
  tools: [CLUSTER_MANAGER_TOOLS.getInfo, CLUSTER_MANAGER_TOOLS.listClusters],
};

/**
 * cluster-manager's tools in fixture mode: it offers reads only, and the
 * installation runs no clusters.
 */
export const clusterManager: FixtureMcpServer = {
  server: CLUSTER_MANAGER_SERVER,
  tools: {
    [CLUSTER_MANAGER_TOOLS.getInfo]: () => info,
    [CLUSTER_MANAGER_TOOLS.listClusters]: () => ({ clusters: [] }),
  },
};
