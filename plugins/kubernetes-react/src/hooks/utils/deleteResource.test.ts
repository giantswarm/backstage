import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { deleteResource } from './deleteResource';

const gvk: CustomResourceMatcher = {
  group: 'helm.toolkit.fluxcd.io',
  apiVersion: 'v2',
  plural: 'helmreleases',
  isCore: false,
};

type ProxyArgs = {
  clusterName: string;
  path: string;
  init: { method: string };
};

function createKubernetesApi(response: Partial<Response>) {
  const proxy = jest.fn(async (_args: ProxyArgs) => response as Response);

  return { api: { proxy } as unknown as KubernetesApi, proxy };
}

describe('deleteResource', () => {
  it('sends a DELETE to the resource path', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await deleteResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'pr-reviewer',
      namespace: 'agent-platform',
    });

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'test-installation',
      // No trailing slash: `getK8sGetPath` appends one, which we do not want to
      // rely on the apiserver tolerating for a mutating verb.
      path: '/apis/helm.toolkit.fluxcd.io/v2/namespaces/agent-platform/helmreleases/pr-reviewer',
      init: { method: 'DELETE' },
    });
  });

  it('sends no body and no headers', async () => {
    // Nothing needs either, and a DELETE with a body is the more awkward path
    // through fetch and any proxy in between.
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await deleteResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'pr-reviewer',
      namespace: 'agent-platform',
    });

    expect(proxy.mock.calls[0][0].init).toEqual({ method: 'DELETE' });
  });

  it('passes a propagation policy as a query parameter', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await deleteResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'pr-reviewer',
      namespace: 'agent-platform',
      propagationPolicy: 'Foreground',
    });

    expect(proxy.mock.calls[0][0].path).toBe(
      '/apis/helm.toolkit.fluxcd.io/v2/namespaces/agent-platform/helmreleases/pr-reviewer?propagationPolicy=Foreground',
    );
  });

  it('omits the namespace segment for a cluster-scoped resource', async () => {
    const { api, proxy } = createKubernetesApi({ ok: true, status: 200 });

    await deleteResource({
      kubernetesApi: api,
      cluster: 'test-installation',
      gvk,
      name: 'pr-reviewer',
    });

    expect(proxy.mock.calls[0][0].path).toBe(
      '/apis/helm.toolkit.fluxcd.io/v2/helmreleases/pr-reviewer',
    );
  });

  it('throws a ForbiddenError on 403', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        message: 'helmreleases.helm.toolkit.fluxcd.io is forbidden',
      }),
    });

    await expect(
      deleteResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        name: 'pr-reviewer',
        namespace: 'agent-platform',
      }),
    ).rejects.toMatchObject({
      name: 'ForbiddenError',
      message: expect.stringContaining(
        'helmreleases.helm.toolkit.fluxcd.io is forbidden',
      ),
    });
  });

  it('throws a NotFoundError on 404, so an idempotent caller can shrug it off', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'helmreleases "pr-reviewer" not found' }),
    });

    await expect(
      deleteResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        name: 'pr-reviewer',
        namespace: 'agent-platform',
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
      deleteResource({
        kubernetesApi: api,
        cluster: 'test-installation',
        gvk,
        name: 'pr-reviewer',
      }),
    ).rejects.toThrow(/Internal Server Error/);
  });
});
