import type { ObjectAction } from '../../lib/clusterManager';
import { isBeingRemoved, objectPath, readBeingRemoved } from './beingRemoved';
import { objectKey } from './removalPasses';

function object(
  kind: string,
  name: string,
  apiVersion = 'helm.toolkit.fluxcd.io/v2',
  action = 'would-delete',
): ObjectAction {
  return { apiVersion, kind, name, namespace: 'org-acme', action };
}

const TERMINATING = { deletionTimestamp: '2026-11-03T10:00:00Z' };

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('objectPath', () => {
  it("builds the object's path at the version cluster-manager read it", () => {
    expect(objectPath(object('HelmRelease', 'demo1'))).toBe(
      '/apis/helm.toolkit.fluxcd.io/v2/namespaces/org-acme/helmreleases/demo1',
    );
    expect(
      objectPath(
        object('OCIRepository', 'demo1', 'source.toolkit.fluxcd.io/v1beta2'),
      ),
    ).toBe(
      '/apis/source.toolkit.fluxcd.io/v1beta2/namespaces/org-acme/ocirepositories/demo1',
    );
    expect(
      objectPath(
        object(
          'Kustomization',
          'inst-1-clusters-demo1',
          'kustomize.toolkit.fluxcd.io/v1',
        ),
      ),
    ).toBe(
      '/apis/kustomize.toolkit.fluxcd.io/v1/namespaces/org-acme/kustomizations/inst-1-clusters-demo1',
    );
    expect(objectPath(object('ConfigMap', 'demo1-cluster-values', 'v1'))).toBe(
      '/api/v1/namespaces/org-acme/configmaps/demo1-cluster-values',
    );
  });

  it('has none for a kind delete_cluster does not delete, or one of another group', () => {
    expect(objectPath(object('Secret', 'demo1', 'v1'))).toBeUndefined();
    expect(
      objectPath(object('HelmRelease', 'demo1', 'other.io/v1')),
    ).toBeUndefined();
  });
});

describe('isBeingRemoved', () => {
  it('is so once the deletion was requested', () => {
    expect(isBeingRemoved(object('HelmRelease', 'demo1'), {})).toBe(false);
    expect(
      isBeingRemoved(object('HelmRelease', 'demo1'), { metadata: TERMINATING }),
    ).toBe(true);
    expect(
      isBeingRemoved(object('OCIRepository', 'demo1'), {
        metadata: TERMINATING,
      }),
    ).toBe(true);
  });

  it('is not so for a release into the cluster that a pass would still suspend', () => {
    const child = object('HelmRelease', 'demo1-llm-d');
    const kubeConfig = { secretRef: { name: 'demo1-kubeconfig' } };

    expect(
      isBeingRemoved(child, { metadata: TERMINATING, spec: { kubeConfig } }),
    ).toBe(false);
    expect(
      isBeingRemoved(child, {
        metadata: TERMINATING,
        spec: { kubeConfig, suspend: true },
      }),
    ).toBe(true);
  });
});

describe('readBeingRemoved', () => {
  it('reads each object a pass would delete as the person, and keeps those being removed', async () => {
    const proxy = jest.fn(async ({ path }: { path: string }) => {
      if (path.endsWith('/helmreleases/demo1')) {
        return response(200, { metadata: TERMINATING });
      }
      if (path.endsWith('/ocirepositories/demo1')) {
        return response(200, { metadata: {} });
      }
      return response(403);
    });
    const objects = [
      object('HelmRelease', 'demo1'),
      object('OCIRepository', 'demo1', 'source.toolkit.fluxcd.io/v1'),
      // Not allowed to read: counts as new.
      object('ConfigMap', 'demo1-cluster-values', 'v1'),
      // Not a delete: not read.
      object('HelmRelease', 'demo1-x', undefined, 'would-update'),
    ];

    const found = await readBeingRemoved({ proxy }, 'inst-1', objects);

    expect([...found]).toEqual([objectKey(objects[0])]);
    expect(proxy).toHaveBeenCalledTimes(3);
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'inst-1',
      path: '/apis/helm.toolkit.fluxcd.io/v2/namespaces/org-acme/helmreleases/demo1',
    });
  });

  it('counts an object as new when its read fails or takes too long', async () => {
    const proxy = jest
      .fn()
      .mockRejectedValueOnce(new Error('proxy down'))
      .mockReturnValueOnce(new Promise(() => {}));

    const found = await readBeingRemoved(
      { proxy },
      'inst-1',
      [object('HelmRelease', 'a'), object('HelmRelease', 'b')],
      10,
    );

    expect(found.size).toBe(0);
  });
});
