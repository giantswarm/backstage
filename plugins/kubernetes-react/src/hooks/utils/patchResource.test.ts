import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { BACKSTAGE_FIELD_MANAGER, patchResource } from './patchResource';

const gvk: CustomResourceMatcher = {
  group: 'kustomize.toolkit.fluxcd.io',
  apiVersion: 'v1',
  plural: 'kustomizations',
  isCore: false,
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

describe('patchResource', () => {
  it('sends a merge patch to the resource path', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await patchResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'my-app',
      namespace: 'flux-system',
      patch: { spec: { suspend: true } },
    });

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'test-installation',
      // No trailing slash: `getK8sGetPath` appends one, which we do not want to
      // rely on the apiserver tolerating for a mutating verb.
      path: '/apis/kustomize.toolkit.fluxcd.io/v1/namespaces/flux-system/kustomizations/my-app?fieldManager=giantswarm-backstage',
      init: {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify({ spec: { suspend: true } }),
      },
    });
  });

  it('passes the content type as a plain object, not a Headers instance', async () => {
    // `KubernetesClient.getKubernetesHeaders` object-spreads these, and a
    // `Headers` instance spreads to `{}` — which would silently drop the
    // content type and make the apiserver reject the patch.
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await patchResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'my-app',
      namespace: 'flux-system',
      patch: {},
    });

    const headers = proxy.mock.calls[0][0].init.headers;
    expect(headers).not.toBeInstanceOf(Headers);
    expect({ ...headers }).toEqual({
      'Content-Type': 'application/merge-patch+json',
    });
  });

  it('omits the namespace segment for a cluster-scoped resource', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await patchResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'my-app',
      patch: {},
    });

    expect(proxy.mock.calls[0][0].path).toBe(
      '/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations/my-app?fieldManager=giantswarm-backstage',
    );
  });

  it('throws a ForbiddenError on 403', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'kustomizations.kustomize is forbidden' }),
    });

    await expect(
      patchResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        name: 'my-app',
        namespace: 'flux-system',
        patch: {},
      }),
    ).rejects.toMatchObject({
      name: 'ForbiddenError',
      message: expect.stringContaining('kustomizations.kustomize is forbidden'),
    });
  });

  it('throws a NotFoundError on 404', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'not found' }),
    });

    await expect(
      patchResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        name: 'my-app',
        namespace: 'flux-system',
        patch: {},
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('falls back to the status text when the body is not a Status object', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(
      patchResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        name: 'my-app',
        patch: {},
      }),
    ).rejects.toThrow(/Internal Server Error/);
  });
});

describe('BACKSTAGE_FIELD_MANAGER', () => {
  it('is an honest, attributable name rather than an impersonation of flux', () => {
    // The apiserver would otherwise derive the manager from the proxied
    // request's User-Agent. Masquerading as `flux` would buy nothing — nothing in
    // Flux keys off that name — and would destroy attribution.
    expect(BACKSTAGE_FIELD_MANAGER).toBe('giantswarm-backstage');
    expect(BACKSTAGE_FIELD_MANAGER).not.toBe('flux');
  });

  it('needs no escaping in a query string', () => {
    expect(encodeURIComponent(BACKSTAGE_FIELD_MANAGER)).toBe(
      BACKSTAGE_FIELD_MANAGER,
    );
  });
});
