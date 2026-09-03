import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { createResource } from './createResource';

const gvk: CustomResourceMatcher = {
  group: 'kagent.dev',
  apiVersion: 'v1alpha2',
  plural: 'modelconfigs',
  isCore: false,
};

const coreGvk: CustomResourceMatcher = {
  group: '',
  apiVersion: 'v1',
  plural: 'secrets',
  isCore: true,
};

type ProxyArgs = {
  clusterName: string;
  path: string;
  init: { method: string; headers: Record<string, string>; body: string };
};

function createKubernetesApi(response: Partial<Response>) {
  const proxy = jest.fn(async (_args: ProxyArgs) => response as Response);

  return { api: { proxy } as unknown as KubernetesApi, proxy };
}

describe('createResource', () => {
  it('POSTs the manifest to the namespaced collection path', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 201 });
    const manifest = {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: 'kagent' },
      spec: { model: 'qwen3-8-27b' },
    };

    await createResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      namespace: 'kagent',
      manifest,
    });

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'test-installation',
      // No trailing slash: `k8sUrl.create` appends one, which we do not want to
      // rely on the apiserver tolerating for a mutating verb.
      path: '/apis/kagent.dev/v1alpha2/namespaces/kagent/modelconfigs?fieldManager=giantswarm-backstage',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      },
    });
  });

  it('builds the core-group path for core resources', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 201 });

    await createResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk: coreGvk,
      namespace: 'kagent',
      manifest: { apiVersion: 'v1', kind: 'Secret' },
    });

    expect(proxy.mock.calls[0][0].path).toBe(
      '/api/v1/namespaces/kagent/secrets?fieldManager=giantswarm-backstage',
    );
  });

  it('passes the content type as a plain object, not a Headers instance', async () => {
    // `KubernetesClient.getKubernetesHeaders` object-spreads these, and a
    // `Headers` instance spreads to `{}` — which would silently drop the
    // content type and make the apiserver reject the create.
    const { api, proxy } = createKubernetesApi({ ok: true, status: 201 });

    await createResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      namespace: 'kagent',
      manifest: {},
    });

    const headers = proxy.mock.calls[0][0].init.headers;
    expect(headers).not.toBeInstanceOf(Headers);
    expect({ ...headers }).toEqual({ 'Content-Type': 'application/json' });
  });

  it('throws a ForbiddenError on 403', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'modelconfigs.kagent.dev is forbidden' }),
    });

    await expect(
      createResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        namespace: 'kagent',
        manifest: {},
      }),
    ).rejects.toMatchObject({
      name: 'ForbiddenError',
      message: expect.stringContaining('modelconfigs.kagent.dev is forbidden'),
    });
  });

  it('throws a ConflictError when the name is already taken', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ message: 'modelconfigs "qwen3" already exists' }),
    });

    await expect(
      createResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        namespace: 'kagent',
        manifest: {},
      }),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      message: expect.stringContaining('already exists'),
    });
  });
});
