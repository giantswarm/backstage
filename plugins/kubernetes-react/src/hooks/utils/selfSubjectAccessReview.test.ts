import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { createSelfSubjectAccessReview } from './selfSubjectAccessReview';

function createKubernetesApi(response: Partial<Response>) {
  const proxy = jest.fn(async () => response as Response);

  return { api: { proxy } as unknown as KubernetesApi, proxy };
}

const resourceAttributes = {
  group: 'kustomize.toolkit.fluxcd.io',
  resource: 'kustomizations',
  namespace: 'flux-system',
  verb: 'patch',
};

describe('createSelfSubjectAccessReview', () => {
  it('posts a SelfSubjectAccessReview and returns the verdict', async () => {
    const { api, proxy } = createKubernetesApi({
      ok: true,
      status: 201,
      json: async () => ({ status: { allowed: true } }),
    });

    await expect(
      createSelfSubjectAccessReview({
        kubernetesApi: api,
        cluster: 'test-installation',
        resourceAttributes,
      }),
    ).resolves.toBe(true);

    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'test-installation',
      path: '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectAccessReview',
          spec: { resourceAttributes },
        }),
      },
    });
  });

  it('returns false when the review denies access', async () => {
    const { api } = createKubernetesApi({
      ok: true,
      status: 201,
      json: async () => ({
        status: { allowed: false, reason: 'no RBAC policy matched' },
      }),
    });

    await expect(
      createSelfSubjectAccessReview({
        kubernetesApi: api,
        cluster: 'test-installation',
        resourceAttributes,
      }),
    ).resolves.toBe(false);
  });

  it('returns false when the response has no status', async () => {
    const { api } = createKubernetesApi({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    await expect(
      createSelfSubjectAccessReview({
        kubernetesApi: api,
        cluster: 'test-installation',
        resourceAttributes,
      }),
    ).resolves.toBe(false);
  });

  it('throws when the review itself is rejected', async () => {
    const { api } = createKubernetesApi({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(
      createSelfSubjectAccessReview({
        kubernetesApi: api,
        cluster: 'test-installation',
        resourceAttributes,
      }),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});
