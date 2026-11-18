import type { ObjectAction } from '../../lib/clusterManager';
import {
  mergeRemovalStates,
  objectPath,
  readRemovalStates,
  removalStateOf,
} from './beingRemoved';
import { objectKey, type RemovalStates } from './removalPasses';

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
      '/apis/helm.toolkit.fluxcd.io/v2/namespaces/org-acme/helmreleases/demo1/',
    );
    expect(
      objectPath(
        object('OCIRepository', 'demo1', 'source.toolkit.fluxcd.io/v1beta2'),
      ),
    ).toBe(
      '/apis/source.toolkit.fluxcd.io/v1beta2/namespaces/org-acme/ocirepositories/demo1/',
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
      '/apis/kustomize.toolkit.fluxcd.io/v1/namespaces/org-acme/kustomizations/inst-1-clusters-demo1/',
    );
    expect(objectPath(object('ConfigMap', 'demo1-cluster-values', 'v1'))).toBe(
      '/api/v1/namespaces/org-acme/configmaps/demo1-cluster-values/',
    );
  });

  it('has none for a kind delete_cluster does not delete, or one of another group', () => {
    expect(objectPath(object('Secret', 'demo1', 'v1'))).toBeUndefined();
    expect(
      objectPath(object('HelmRelease', 'demo1', 'other.io/v1')),
    ).toBeUndefined();
    expect(
      objectPath(object('ConfigMap', 'demo1', 'other.io/v1')),
    ).toBeUndefined();
  });
});

describe('removalStateOf', () => {
  it('is going once the deletion was requested', () => {
    expect(removalStateOf(object('HelmRelease', 'demo1'), {})).toBe('live');
    expect(
      removalStateOf(object('HelmRelease', 'demo1'), { metadata: TERMINATING }),
    ).toBe('going');
    expect(
      removalStateOf(object('OCIRepository', 'demo1'), {
        metadata: TERMINATING,
      }),
    ).toBe('going');
  });

  it('needs a pass for a release into the cluster that a pass would still suspend', () => {
    const child = object('HelmRelease', 'demo1-llm-d');
    const kubeConfig = { secretRef: { name: 'demo1-kubeconfig' } };

    expect(
      removalStateOf(child, { metadata: TERMINATING, spec: { kubeConfig } }),
    ).toBe('needs-pass');
    expect(
      removalStateOf(child, {
        metadata: TERMINATING,
        spec: { kubeConfig, suspend: true },
      }),
    ).toBe('going');
    expect(removalStateOf(child, { spec: { kubeConfig } })).toBe('live');
  });
});

describe('readRemovalStates', () => {
  it('reads each object a pass would delete as the person, and answers the state of those read', async () => {
    const proxy = jest.fn(async ({ path }: { path: string }) => {
      if (path.endsWith('/helmreleases/demo1/')) {
        return response(200, { metadata: TERMINATING });
      }
      if (path.endsWith('/ocirepositories/demo1/')) {
        return response(200, { metadata: {} });
      }
      return response(403);
    });
    const objects = [
      object('HelmRelease', 'demo1'),
      object('OCIRepository', 'demo1', 'source.toolkit.fluxcd.io/v1'),
      // Not allowed to read: not in the answer.
      object('ConfigMap', 'demo1-cluster-values', 'v1'),
      // Not a delete: not read.
      object('HelmRelease', 'demo1-x', undefined, 'would-update'),
    ];

    const { states, failed } = await readRemovalStates(
      { proxy },
      'inst-1',
      objects,
      new Map(),
    );

    expect([...states]).toEqual([
      [objectKey(objects[0]), 'going'],
      [objectKey(objects[1]), 'live'],
    ]);
    // A 403 is an answer about the object, not a failure of the proxy.
    expect(failed).toBe(false);
    expect(proxy).toHaveBeenCalledTimes(3);
    expect(proxy).toHaveBeenCalledWith({
      clusterName: 'inst-1',
      path: '/apis/helm.toolkit.fluxcd.io/v2/namespaces/org-acme/helmreleases/demo1/',
      init: { signal: expect.any(AbortSignal) },
    });
  });

  it('does not read again an object known to be going', async () => {
    const proxy = jest.fn(async () => response(200, { metadata: {} }));
    const going = object('HelmRelease', 'demo1');
    const live = object('HelmRelease', 'demo1-apps');
    const known: RemovalStates = new Map([
      [objectKey(going), 'going'],
      [objectKey(live), 'live'],
    ]);

    await readRemovalStates({ proxy }, 'inst-1', [going, live], known);

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/demo1-apps\/$/) }),
    );
  });

  it('answers a failed round when the proxy cannot reach the installation', async () => {
    const proxy = jest.fn(async () => response(500));

    const { states, failed } = await readRemovalStates(
      { proxy },
      'inst-1',
      [object('HelmRelease', 'demo1')],
      new Map(),
    );

    expect(states.size).toBe(0);
    expect(failed).toBe(true);
  });

  it('does not answer a failed round for an object that is gone', async () => {
    const proxy = jest.fn(async () => response(404));

    const { failed } = await readRemovalStates(
      { proxy },
      'inst-1',
      [object('HelmRelease', 'demo1')],
      new Map(),
    );

    expect(failed).toBe(false);
  });

  it('leaves out an object whose read fails, and aborts one that takes too long', async () => {
    let signal: AbortSignal | undefined;
    const proxy = jest
      .fn()
      .mockRejectedValueOnce(new Error('proxy down'))
      .mockImplementationOnce(({ init }: { init: RequestInit }) => {
        signal = init.signal ?? undefined;
        return new Promise(() => {});
      });

    const { states, failed } = await readRemovalStates(
      { proxy },
      'inst-1',
      [object('HelmRelease', 'a'), object('HelmRelease', 'b')],
      new Map(),
      10,
    );

    expect(states.size).toBe(0);
    expect(failed).toBe(true);
    expect(signal?.aborted).toBe(true);
  });
});

describe('mergeRemovalStates', () => {
  const a = object('HelmRelease', 'a');
  const b = object('HelmRelease', 'b');
  const c = object('HelmRelease', 'c');

  it('replaces what was read, keeps what was not, and forgets what is no longer listed', () => {
    const known: RemovalStates = new Map([
      [objectKey(a), 'going'],
      [objectKey(b), 'going'],
      [objectKey(c), 'going'],
    ]);

    const merged = mergeRemovalStates(
      known,
      // c is gone: the dry run no longer lists it.
      [a, b],
      // a was deleted and made again; b's read failed.
      new Map([[objectKey(a), 'live']]),
    );

    expect([...merged]).toEqual([
      [objectKey(a), 'live'],
      [objectKey(b), 'going'],
    ]);
  });
});
