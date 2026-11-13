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

  it('lists no objects and finds none', async () => {
    const list = await get(
      '/apis/muster.giantswarm.io/v1alpha1/namespaces/muster/mcpservers?limit=500',
    );
    expect(list.status).toBe(200);
    expect((await list.json()).items).toEqual([]);

    const one = await get(
      '/apis/muster.giantswarm.io/v1alpha1/namespaces/muster/mcpservers/gadgets',
    );
    expect(one.status).toBe(404);

    expect((await (await get('/api/v1/namespaces')).json()).items).toEqual([]);
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
    const unknown = await get('/version');

    expect(write.status).toBe(501);
    expect(unknown.status).toBe(501);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('knows the fixture installation only', async () => {
    await expect(api.getClusters()).resolves.toEqual([
      { name: 'meadow', authProvider: 'serviceAccount' },
    ]);
    await expect(api.getCluster('elsewhere')).resolves.toBeUndefined();
    expect((await get('/apis', 'elsewhere')).status).toBe(404);
  });
});
