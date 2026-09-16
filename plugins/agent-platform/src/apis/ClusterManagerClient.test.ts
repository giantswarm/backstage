import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { ClusterManagerNotConnectedError } from '../lib/clusterManager';
import { ClusterManagerClient } from './ClusterManagerClient';

function makeMusterApi(answer: unknown = {}) {
  const callTool = jest.fn(
    async (_name: string, _args: Record<string, unknown>) => answer,
  );
  const describeTool = jest.fn(async () => ({
    inputSchema: {
      properties: { accelerator: { enum: ['nvidia-l4', 'nvidia-t4'] } },
    },
  }));
  return {
    api: { callTool, describeTool } as unknown as MusterApi,
    callTool,
    describeTool,
  };
}

describe('ClusterManagerClient', () => {
  it('calls create_node_pool with dryRun and only what the person set', async () => {
    const { api, callTool } = makeMusterApi({ cluster: 'wc1', pool: 'gpu-l4' });
    const client = new ClusterManagerClient(api, 'inst-1');
    await client.createNodePool(
      {
        cluster: 'wc1',
        namespace: 'org-acme',
        name: 'gpu-l4',
        accelerator: 'nvidia-l4',
        maxGpus: 4,
        sizes: [],
      },
      { dryRun: true },
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_cluster-manager_create_node_pool',
      {
        cluster: 'wc1',
        namespace: 'org-acme',
        name: 'gpu-l4',
        accelerator: 'nvidia-l4',
        maxGpus: 4,
        dryRun: true,
        mode: 'apply',
      },
      'inst-1',
    );
  });

  it('deploys with mode apply and commits with mode commit', async () => {
    const { api, callTool } = makeMusterApi();
    const client = new ClusterManagerClient(api, 'inst-1');
    await client.createNodePool(
      { cluster: 'wc1', name: 'gpu-l4' },
      { mode: 'apply' },
    );
    await client.createNodePool(
      { cluster: 'wc1', name: 'gpu-l4' },
      { mode: 'commit' },
    );
    expect(
      callTool.mock.calls.map(
        call => (call[1] as Record<string, unknown>).mode,
      ),
    ).toEqual(['apply', 'commit']);
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('dryRun');
  });

  it('passes force to delete_node_pool only when asked', async () => {
    const { api, callTool } = makeMusterApi();
    const client = new ClusterManagerClient(api, 'inst-1');
    await client.deleteNodePool(
      { cluster: 'wc1', name: 'gpu-l4' },
      { mode: 'apply' },
    );
    await client.deleteNodePool(
      { cluster: 'wc1', name: 'gpu-l4' },
      { mode: 'apply', force: true },
    );
    expect(callTool.mock.calls[0][0]).toBe(
      'x_cluster-manager_delete_node_pool',
    );
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('force');
    expect(callTool.mock.calls[1][1]).toMatchObject({ force: true });
  });

  it('unwraps list_clusters and tolerates a null list', async () => {
    const { api } = makeMusterApi({ clusters: null });
    const client = new ClusterManagerClient(api, 'inst-1');
    await expect(client.listClusters()).resolves.toEqual([]);
  });

  it("classifies muster's tool-not-found as not connected", async () => {
    const callTool = jest.fn(async () => {
      throw new Error('tool not found: x_cluster-manager_get_info');
    });
    const client = new ClusterManagerClient(
      { callTool } as unknown as MusterApi,
      'inst-1',
    );
    await expect(client.getInfo()).rejects.toBeInstanceOf(
      ClusterManagerNotConnectedError,
    );
  });

  it("reads the accelerators from the create tool's schema, with a fallback", async () => {
    const { api } = makeMusterApi();
    await expect(
      new ClusterManagerClient(api, 'inst-1').listAccelerators(),
    ).resolves.toEqual(['nvidia-l4', 'nvidia-t4']);
    const broken = {
      describeTool: jest.fn(async () => {
        throw new Error('nope');
      }),
    } as unknown as MusterApi;
    await expect(
      new ClusterManagerClient(broken, 'inst-1').listAccelerators(),
    ).resolves.toContain('nvidia-l4');
  });
});
