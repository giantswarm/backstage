import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  CLUSTER_MANAGER_TOOLS,
  ClusterManagerError,
  mountedClaimOf,
  offersTool,
} from '../../../lib/clusterManager';
import { musterApiOf } from '../../../lib/__testUtils__/musterApiOf';
import { ClusterManagerClient } from '../../ClusterManagerClient';
import { ModelManagerApiClient } from '../../ModelManagerApiClient';
import { ModelManagerToolsClient } from '../../ModelManagerToolsClient';
import { SETTLE_MS } from '../agentManagerFixtureState';
import { ModelHostingFixtureState } from '../modelHostingFixtureState';
import { clusterManagerFixtureServer } from './clusterManager';
import { modelManagerFixtureServer } from './modelManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  let now = NOW;
  const state = new ModelHostingFixtureState(data, () => now);
  const server = clusterManagerFixtureServer(() => state);
  const models = new ModelManagerApiClient({
    musterApi: musterApiOf(modelManagerFixtureServer(() => state)),
    discoveryApi: {} as never,
    fetchApi: {} as never,
    kubernetesApi: {} as never,
    kubernetesAuthProvidersApi: {} as never,
  });
  return {
    data,
    server,
    client: new ClusterManagerClient(musterApiOf(server), INSTALLATION),
    models,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function failureOf(call: Promise<unknown>): Promise<ClusterManagerError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ClusterManagerError);
  return error as ClusterManagerError;
}

describe('the fixture cluster-manager', () => {
  it('has a handler for every tool the pool and cache pages call', () => {
    const { server } = setup();
    // The Clusters page's writes are not served: left out as get_info leaves them out.
    expect(Object.keys(server.tools).sort()).toEqual(
      Object.values(CLUSTER_MANAGER_TOOLS)
        .filter(
          tool =>
            tool !== CLUSTER_MANAGER_TOOLS.createCluster &&
            tool !== CLUSTER_MANAGER_TOOLS.deleteCluster,
        )
        .sort(),
    );
  });

  it('offers the pool and cache writes live, not the Clusters page', async () => {
    const { client } = setup();
    const info = await client.getInfo();
    expect(info.modes).toEqual({ apply: true, commit: false });
    for (const tool of [
      CLUSTER_MANAGER_TOOLS.listNodePools,
      CLUSTER_MANAGER_TOOLS.createNodePool,
      CLUSTER_MANAGER_TOOLS.deleteNodePool,
      CLUSTER_MANAGER_TOOLS.removeModelCache,
    ]) {
      expect(offersTool(info, tool)).toBe(true);
    }
    expect(offersTool(info, CLUSTER_MANAGER_TOOLS.createCluster)).toBe(false);
  });

  it('describes create_node_pool with its accelerators, zones and cache', async () => {
    const { client } = setup();
    const schema = await client.createNodePoolSchema();
    expect(schema.accelerators).toEqual([
      'nvidia-l4',
      'nvidia-a10g',
      'nvidia-t4',
      'nvidia-l40s',
    ]);
    expect(schema.arguments).toEqual(
      expect.arrayContaining(['zones', 'cache']),
    );
  });

  it("lists the GPU cluster of the KServe backend with its pools' releases and cache", async () => {
    const { client, data } = setup();
    const { clusters, clusterApi } = await client.listClusters();
    expect(clusterApi?.state).toBe('served');
    const expected = data.gpuClusters.filter(
      c => c.installation === INSTALLATION,
    );
    expect(clusters.map(c => c.name)).toEqual(expected.map(c => c.name));
    const [cluster] = clusters;
    expect(cluster.poolReleases.length).toBeGreaterThan(0);
    expect(cluster.serving.readiness?.backend.registered).toBe(true);
    expect(expected[0].cache).toBe(true);
    expect(mountedClaimOf(cluster)).toEqual(
      expect.objectContaining({ mounted: true, price: expect.any(Object) }),
    );
  });

  it('lists the pools of a cluster in their phases, owned by their release', async () => {
    const { client } = setup();
    const [cluster] = (await client.listClusters()).clusters;
    const { nodePools } = await client.listNodePools(
      cluster.name,
      cluster.namespace,
    );
    expect(nodePools.length).toBe(cluster.poolReleases.length);
    for (const pool of nodePools) {
      expect(pool.ownerRelease).not.toBeNull();
      expect(pool.name.startsWith(`${cluster.name}-`)).toBe(true);
      expect(pool.steps?.map(s => s.name)).toEqual([
        'release',
        'machinePool',
        'nodes',
      ]);
    }
    const missing = await failureOf(client.listNodePools('nothing'));
    expect(missing.message).toBe(
      'cluster nothing not found: list_clusters names the clusters you may see',
    );
  });

  it('prices a pool in a dry run and creates it, which comes up after a while', async () => {
    const { client, advance } = setup();
    const [cluster] = (await client.listClusters()).clusters;
    const input = {
      cluster: cluster.name,
      namespace: cluster.namespace,
      name: 'gpu-l40s',
      accelerator: 'nvidia-l40s',
    };
    const dry = await client.createNodePool(input, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.sizes?.map(s => s.instanceType)).toEqual([
      'g6e.xlarge',
      'g6e.2xlarge',
      'g6e.4xlarge',
    ]);
    expect(dry.sizes?.every(s => s.pricePerHourUSD! > 0)).toBe(true);
    expect(dry.presetFit?.presets?.length).toBeGreaterThan(0);
    expect(dry.objects.map(o => o.action)).toContain('would-create');
    const before = (await client.listNodePools(cluster.name)).nodePools.length;
    const applied = await client.createNodePool(input);
    expect(applied.dryRun).toBe(false);
    const pools = (await client.listNodePools(cluster.name)).nodePools;
    expect(pools).toHaveLength(before + 1);
    expect(pools.find(p => p.name === `${cluster.name}-gpu-l40s`)?.phase).toBe(
      'creating',
    );
    advance(2 * SETTLE_MS);
    expect(
      (await client.listNodePools(cluster.name)).nodePools.find(
        p => p.name === `${cluster.name}-gpu-l40s`,
      )?.phase,
    ).toBe('ready');
    const badName = await failureOf(
      client.createNodePool({ ...input, name: 'X' }),
    );
    expect(badName.message).toContain('five to twenty lowercase characters');
  });

  it('refuses to delete a pool that serves a model, naming it, and deletes it forced', async () => {
    const { client, models, data, advance } = setup();
    const [cluster] = (await client.listClusters()).clusters;
    const loaded = await models.listLoaded(INSTALLATION, { backend: 'kserve' });
    const node = loaded.find(m => m.node)?.node;
    const pool = data.gpuPools.find(p => node && p.nodes.includes(node))!;
    const name = pool.name.slice(cluster.name.length + 1);
    const refused = await failureOf(
      client.deleteNodePool({ cluster: cluster.name, name }),
    );
    expect(refused.message).toMatch(
      /^node pool .* still runs \d+ busy node\(s\)/,
    );
    expect(refused.refused?.nodes).toContain(node);
    expect(refused.refused?.models.length).toBeGreaterThan(0);
    const deleted = await client.deleteNodePool(
      { cluster: cluster.name, name },
      { force: true },
    );
    expect(deleted.objects.map(o => o.action)).toContain('deleted');
    expect(
      (await client.listNodePools(cluster.name)).nodePools.find(
        p => p.name === pool.name,
      )?.phase,
    ).toBe('removing');
    advance(2 * SETTLE_MS);
    expect(
      (await client.listNodePools(cluster.name)).nodePools.map(p => p.name),
    ).not.toContain(pool.name);
  });

  it('refuses to remove a model cache a served model reads, naming the models', async () => {
    const { client, models, data } = setup();
    const [cluster] = data.gpuClusters.filter(
      c => c.installation === INSTALLATION,
    );
    expect(cluster.cache).toBe(true);
    const loaded = await models.listLoaded(INSTALLATION, { backend: 'kserve' });
    expect(loaded.length).toBeGreaterThan(0);
    const refused = await failureOf(
      client.removeModelCache({ cluster: cluster.name }),
    );
    expect(refused.message).toMatch(
      new RegExp(`^the model cache of ${cluster.name} is in use — `),
    );
    expect(refused.refused?.models).toHaveLength(loaded.length);
  });

  it('removes the cache of a cluster that serves nothing, pricing what goes', async () => {
    const data = createFixtureDataSet({
      now: NOW,
      hostedModels: { states: ['downloaded'] },
    });
    const state = new ModelHostingFixtureState(data, () => NOW);
    const withCache = data.gpuClusters.find(c => c.cache)!;
    const client = new ClusterManagerClient(
      musterApiOf(clusterManagerFixtureServer(() => state)),
      withCache.installation,
    );
    const dry = await client.removeModelCache(
      { cluster: withCache.name },
      { dryRun: true },
    );
    expect(dry.removedClaims?.every(c => c.price!.monthlyUSD > 0)).toBe(true);
    await client.removeModelCache({ cluster: withCache.name });
    const cluster = (await client.listClusters()).clusters.find(
      c => c.name === withCache.name,
    )!;
    expect(cluster.serving.readiness?.cacheClaims).toEqual([]);
    expect(cluster.serving.readiness?.cache?.enabled).toBe(false);
  });

  it('seats no model on a pool being removed, and gives a new pool a node once it is up', async () => {
    const { client, models, advance, data } = setup();
    const removing = data.gpuPools.filter(p => p.state === 'removing');
    expect(removing.length).toBeGreaterThan(0);
    for (const installation of ['meadow', 'fennel']) {
      const nodes = (
        await models.listNodes(installation, { backend: 'kserve' })
      ).map(n => n.name);
      for (const pool of removing.filter(
        p => p.installation === installation,
      )) {
        for (const node of pool.nodes) {
          expect(nodes).not.toContain(node);
        }
      }
    }
    const [cluster] = (await client.listClusters()).clusters;
    await client.createNodePool({
      cluster: cluster.name,
      name: 'gpu-new',
      accelerator: 'nvidia-l40s',
    });
    advance(2 * SETTLE_MS);
    const pool = (await client.listNodePools(cluster.name)).nodePools.find(
      p => p.name === `${cluster.name}-gpu-new`,
    )!;
    expect(pool).toEqual(
      expect.objectContaining({ phase: 'ready', readyReplicas: 1 }),
    );
    const nodes = await models.listNodes(INSTALLATION, { backend: 'kserve' });
    expect(nodes.some(n => n.name.startsWith(`${cluster.name}-gpu-new-`))).toBe(
      true,
    );
  });

  it('keeps a pool written again before its removal settled, and counts only pools that stay for lastPool', async () => {
    const data = createFixtureDataSet({
      now: NOW,
      hostedModels: { states: ['downloaded'] },
    });
    let now = NOW;
    const state = new ModelHostingFixtureState(data, () => now);
    const client = new ClusterManagerClient(
      musterApiOf(clusterManagerFixtureServer(() => state)),
      INSTALLATION,
    );
    const [cluster] = (await client.listClusters()).clusters;
    const pools = (await client.listNodePools(cluster.name)).nodePools.filter(
      p => p.phase !== 'removing',
    );
    const names = pools.map(p => p.name.slice(cluster.name.length + 1));
    const results = [];
    for (const name of names) {
      results.push(
        await client.deleteNodePool(
          { cluster: cluster.name, name },
          { force: true },
        ),
      );
    }
    expect(results.map(r => r.lastPool)).toEqual(
      names.map((_, i) => i === names.length - 1),
    );
    await client.createNodePool({ cluster: cluster.name, name: names[0] });
    now += 2 * SETTLE_MS;
    expect(
      (await client.listNodePools(cluster.name)).nodePools.map(p => p.name),
    ).toContain(`${cluster.name}-${names[0]}`);
  });

  it('refuses an accelerator it does not know, prototype names included', async () => {
    const { client } = setup();
    const [cluster] = (await client.listClusters()).clusters;
    const error = await failureOf(
      client.createNodePool(
        { cluster: cluster.name, name: 'gpu-odd', accelerator: 'constructor' },
        { dryRun: true },
      ),
    );
    expect(error.message).toBe(
      'accelerator "constructor": one of nvidia-l4, nvidia-a10g, nvidia-t4, nvidia-l40s',
    );
  });

  it("links a KServe backend added for a GPU cluster, so the cluster's next pool keeps it", async () => {
    const { data } = setup();
    const state = new ModelHostingFixtureState(data, () => NOW);
    const clusters = new ClusterManagerClient(
      musterApiOf(clusterManagerFixtureServer(() => state)),
      INSTALLATION,
    );
    const tools = new ModelManagerToolsClient(
      musterApiOf(modelManagerFixtureServer(() => state)),
      INSTALLATION,
    );
    const [cluster] = (await clusters.listClusters()).clusters;
    await tools.removeBackend('kserve');
    expect(
      (await clusters.listClusters()).clusters[0].serving.readiness?.backend
        .registered,
    ).toBe(false);
    await tools.addBackend({
      kind: 'kserve',
      cluster: cluster.name,
      servingNamespace: 'model-serving',
    });
    expect(
      (await clusters.listClusters()).clusters[0].serving.readiness?.backend
        .registered,
    ).toBe(true);
    const pool = await clusters.createNodePool({
      cluster: cluster.name,
      name: 'gpu-again',
    });
    expect(pool.backend?.name).toBe('model-backend-kserve');
  });
});
