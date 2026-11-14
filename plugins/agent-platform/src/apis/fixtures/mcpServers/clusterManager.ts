// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  CLUSTER_MANAGER_SERVER,
  CLUSTER_MANAGER_TOOLS,
} from '../../../lib/clusterManager';
import {
  FIXTURE_POOL_ACCELERATORS,
  modelHostingFixtureState,
  type ModelHostingFixtureState,
} from '../modelHostingFixtureState';
import { asJson, text } from './jsonTools';

/**
 * `create_node_pool`'s schema as cluster-manager declares it, so the Add GPU
 * node pool form offers its accelerators, zones and model cache.
 */
const CREATE_NODE_POOL_SCHEMA = {
  type: 'object',
  properties: {
    cluster: { type: 'string' },
    namespace: { type: 'string' },
    name: { type: 'string', pattern: '^[a-z0-9][-a-z0-9]{3,18}[a-z0-9]$' },
    accelerator: {
      type: 'string',
      description:
        'Accelerator from the curated list; picks the EC2 instance family',
      enum: [...FIXTURE_POOL_ACCELERATORS],
      default: FIXTURE_POOL_ACCELERATORS[0],
    },
    sizes: { type: 'array', items: { type: 'string' } },
    maxGpus: { type: 'number', minimum: 1, default: 4 },
    chartVersion: { type: 'string' },
    zones: { type: 'array', items: { type: 'string' } },
    cache: { type: 'boolean', default: false },
    serving: { type: 'boolean', default: true },
    dryRun: { type: 'boolean', default: false },
    mode: { type: 'string', enum: ['apply', 'commit'] },
  },
  required: ['cluster', 'name'],
};

/**
 * cluster-manager's tools in fixture mode, on `state` (the shared one by
 * default): the GPU clusters of the data set with their pools and model
 * cache, and the pools a person adds and removes, kept in memory until the
 * page reloads. The Clusters page's `create_cluster` and `delete_cluster` are
 * not served, and `get_info` leaves them out too: a call fails as any tool
 * without a handler does.
 */
export function clusterManagerFixtureServer(
  state: () => ModelHostingFixtureState = modelHostingFixtureState,
): FixtureMcpServer {
  const tools: FixtureMcpServer['tools'] = {
    [CLUSTER_MANAGER_TOOLS.getInfo]: () => state().clusterManagerInfo(),
    [CLUSTER_MANAGER_TOOLS.listClusters]: (_, { installation }) =>
      state().listClusters(installation),
    [CLUSTER_MANAGER_TOOLS.listReleases]: () => ({
      providers: [],
      releases: [],
    }),
    [CLUSTER_MANAGER_TOOLS.listNodePools]: (args, { installation }) =>
      state().listNodePools(installation, {
        cluster: text(args, 'cluster'),
        ...(args.namespace !== undefined && {
          namespace: text(args, 'namespace'),
        }),
      }),
    [CLUSTER_MANAGER_TOOLS.createNodePool]: (args, { installation }) =>
      state().createNodePool(installation, args),
    [CLUSTER_MANAGER_TOOLS.deleteNodePool]: (args, { installation }) =>
      state().deleteNodePool(installation, args),
    [CLUSTER_MANAGER_TOOLS.removeModelCache]: (args, { installation }) =>
      state().removeModelCache(installation, args),
  };
  return {
    server: CLUSTER_MANAGER_SERVER,
    tools: asJson(tools),
    inputSchemas: {
      [CLUSTER_MANAGER_TOOLS.createNodePool]: CREATE_NODE_POOL_SCHEMA,
    },
  };
}

/** cluster-manager's tools in fixture mode. */
export const clusterManager: FixtureMcpServer = clusterManagerFixtureServer();
