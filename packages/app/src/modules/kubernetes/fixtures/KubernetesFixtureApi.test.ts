// eslint-disable-next-line no-restricted-imports
import { resolve } from 'path';
import { ConfigReader } from '@backstage/config';
import { loadConfig } from '@backstage/config-loader';
import { FIXTURE_INSTALLATIONS } from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { MCPServer } from '@giantswarm/backstage-plugin-muster';

import { KubernetesFixtureApi } from './KubernetesFixtureApi';

describe('KubernetesFixtureApi', () => {
  const api = new KubernetesFixtureApi();
  const get = (path: string, clusterName = 'meadow') =>
    api.proxy({ clusterName, path });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves the Agent Platform API groups, not model hosting or Cluster API', async () => {
    const response = await get('/apis');
    const names = (await response.json()).groups.map(
      (group: { name: string }) => group.name,
    );

    expect(names).toEqual(
      expect.arrayContaining(['api.kagent.dev', 'muster.giantswarm.io']),
    );
    expect(names).not.toContain('serving.kserve.io');
    expect(names).not.toContain('cluster.x-k8s.io');
  });

  it('discovers the versions and resources the resource classes read', async () => {
    const group = await (await get('/apis/muster.giantswarm.io')).json();
    expect(group.versions).toEqual([
      { groupVersion: 'muster.giantswarm.io/v1alpha1', version: 'v1alpha1' },
    ]);

    const resources = await (
      await get('/apis/muster.giantswarm.io/v1alpha1')
    ).json();
    expect(resources.resources.map((r: { name: string }) => r.name)).toEqual(
      expect.arrayContaining(['mcpservers', 'workflows']),
    );
  });

  it('prefers the newest version of a group, as an API server does', async () => {
    const group = await (await get('/apis/source.toolkit.fluxcd.io')).json();

    expect(group.preferredVersion).toEqual({
      groupVersion: 'source.toolkit.fluxcd.io/v1',
      version: 'v1',
    });
    expect(group.versions[0]).toEqual(group.preferredVersion);
  });

  it('answers the server version', async () => {
    const response = await get('/version');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ gitVersion: expect.stringMatching(/^v1\./) }),
    );
  });

  it('lists muster’s MCP servers and workflows of the installation', async () => {
    const data = baseDataSet();
    const list = await get(
      '/apis/muster.giantswarm.io/v1alpha1/mcpservers?limit=500',
      'fennel',
    );
    expect(list.status).toBe(200);
    const servers = (await list.json()).items.map(
      (item: object) => new MCPServer(item as any, 'fennel'),
    );
    expect(servers.map((s: MCPServer) => [s.getName(), s.getState()])).toEqual(
      inInstallation(data.connectors, 'fennel').map(c => [c.name, c.state]),
    );

    const workflows = await (
      await get(
        '/apis/muster.giantswarm.io/v1alpha1/namespaces/agent-platform/workflows',
      )
    ).json();
    expect(workflows.items.map((w: { kind: string }) => w.kind)).toEqual(
      inInstallation(data.workflows, 'meadow').map(() => 'Workflow'),
    );

    const [first] = servers;
    const one = await get(
      `/apis/muster.giantswarm.io/v1alpha1/namespaces/agent-platform/mcpservers/${first.getName()}`,
      'fennel',
    );
    expect((await one.json()).metadata.name).toBe(first.getName());
  });

  it('lists the agents of the installation, each with its carrier', async () => {
    const data = baseDataSet();
    const agents = (
      await (await get('/apis/api.kagent.dev/v1alpha3/agents')).json()
    ).items.map((item: { metadata: { name: string } }) => item.metadata.name);
    // An agent whose release failed renders no Agent.
    expect(agents.sort()).toEqual(
      inInstallation(data.agents, 'meadow')
        .filter(agent => agent.release === 'ready')
        .map(agent => agent.name)
        .sort(),
    );
    const carriers = (
      await (await get('/apis/api.kagent.dev/v1alpha3/remotemcpservers')).json()
    ).items.map((item: { metadata: { name: string } }) => item.metadata.name);
    expect(carriers.sort()).toEqual(agents);
  });

  it('lists what a source answers once it answers another list', async () => {
    const agent = (name: string) => ({
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: { name, namespace: 'agents' },
    });
    let objects = [agent('first')];
    const written = new KubernetesFixtureApi([() => objects]);
    const names = async () =>
      (
        await (
          await written.proxy({
            clusterName: 'meadow',
            path: '/apis/api.kagent.dev/v1alpha3/agents',
          })
        ).json()
      ).items.map((item: { metadata: { name: string } }) => item.metadata.name);

    expect(await names()).toEqual(['first']);
    objects = [...objects, agent('second')];
    expect(await names()).toEqual(['first', 'second']);
  });

  it('finds nothing a source does not hold', async () => {
    const empty = new KubernetesFixtureApi([]);
    const list = await empty.proxy({
      clusterName: 'meadow',
      path: '/apis/muster.giantswarm.io/v1alpha1/mcpservers',
    });
    expect((await list.json()).items).toEqual([]);

    const elsewhere = await get(
      '/apis/muster.giantswarm.io/v1alpha1/namespaces/muster/mcpservers',
    );
    expect((await elsewhere.json()).items).toEqual([]);

    const one = await get(
      '/apis/muster.giantswarm.io/v1alpha1/namespaces/agent-platform/mcpservers/gadgets',
    );
    expect(one.status).toBe(404);

    expect((await (await get('/api/v1/namespaces')).json()).items).toEqual([]);

    const otherVersion = await get(
      '/apis/muster.giantswarm.io/v9/mcpservers',
      'fennel',
    );
    expect(otherVersion.status).toBe(404);
  });

  it('allows what an access review asks about', async () => {
    const response = await api.proxy({
      clusterName: 'meadow',
      path: '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
      init: {
        method: 'POST',
        body: JSON.stringify({
          spec: { resourceAttributes: { verb: 'list' } },
        }),
      },
    });

    expect((await response.json()).status).toEqual({ allowed: true });
  });

  it('fails a request it does not answer, loudly', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const write = await api.proxy({
      clusterName: 'meadow',
      path: '/apis/muster.giantswarm.io/v1alpha1/namespaces/muster/mcpservers',
      init: { method: 'POST', body: '{}' },
    });
    const unknown = await get('/healthz');

    expect(write.status).toBe(501);
    expect(unknown.status).toBe(501);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('knows the fixture installations only', async () => {
    await expect(api.getClusters()).resolves.toEqual([
      { name: 'meadow', authProvider: 'serviceAccount' },
      { name: 'fennel', authProvider: 'serviceAccount' },
      { name: 'tarragon', authProvider: 'serviceAccount' },
    ]);
    await expect(api.getCluster('fennel')).resolves.toEqual({
      name: 'fennel',
      authProvider: 'serviceAccount',
    });
    expect((await get('/apis', 'tarragon')).status).toBe(200);
    await expect(api.getCluster('elsewhere')).resolves.toBeUndefined();
    expect((await get('/apis', 'elsewhere')).status).toBe(404);
  });
});

describe('app-config.fixtures.yaml', () => {
  it('names the installations every fixture API serves, and only those', async () => {
    const root = resolve(__dirname, '../../../../../..');
    const { appConfigs } = await loadConfig({
      configRoot: root,
      configTargets: [{ path: resolve(root, 'app-config.fixtures.yaml') }],
    });
    const config = ConfigReader.fromConfigs(appConfigs);

    expect(config.getConfig('gs.installations').keys()).toEqual([
      ...FIXTURE_INSTALLATIONS,
    ]);
  });
});
