import { mockServices } from '@backstage/backend-test-utils';
import { PatchStrategy } from '@kubernetes/client-node';
import { KubernetesClientFactory } from '../lib/KubernetesClientFactory';
import { createKubeApplyAction } from './kubeApply';

const MANIFEST = `
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: my-agent
  namespace: org-giantswarm
spec:
  interval: 10m
---
# a comment-only document is skipped
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: my-agent
  namespace: org-giantswarm
spec:
  interval: 10m
`;

function makeAction(client: {
  read: jest.Mock;
  patch: jest.Mock;
  create: jest.Mock;
}) {
  const getObjectsClient = jest.fn().mockReturnValue(client);
  const factory = { getObjectsClient } as unknown as KubernetesClientFactory;
  return { action: createKubeApplyAction(factory), getObjectsClient };
}

function makeContext(input: Record<string, unknown>) {
  return {
    input,
    logger: mockServices.logger.mock(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('kube:apply', () => {
  it('creates missing resources and patches existing ones', async () => {
    const client = {
      read: jest
        .fn()
        .mockResolvedValueOnce({}) // OCIRepository exists
        .mockRejectedValueOnce(new Error('not found')), // HelmRelease is new
      patch: jest.fn().mockImplementation(async spec => spec),
      create: jest.fn().mockImplementation(async spec => spec),
    };
    const { action, getObjectsClient } = makeAction(client);

    await action.handler(
      makeContext({
        manifest: MANIFEST,
        namespaced: true,
        clusterName: 'gazelle',
        token: 'user-oidc-token',
      }),
    );

    expect(getObjectsClient).toHaveBeenCalledWith({
      clusterName: 'gazelle',
      token: 'user-oidc-token',
    });

    expect(client.patch).toHaveBeenCalledTimes(1);
    expect(client.patch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'OCIRepository' }),
      undefined,
      undefined,
      undefined,
      undefined,
      PatchStrategy.MergePatch,
    );

    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'HelmRelease' }),
    );
  });

  it('records the applied spec in the last-applied annotation', async () => {
    const client = {
      read: jest.fn().mockRejectedValue(new Error('not found')),
      patch: jest.fn(),
      create: jest.fn().mockImplementation(async spec => spec),
    };
    const { action } = makeAction(client);

    await action.handler(makeContext({ manifest: MANIFEST }));

    const spec = client.create.mock.calls[0][0];
    const annotation =
      spec.metadata.annotations[
        'kubectl.kubernetes.io/last-applied-configuration'
      ];
    expect(JSON.parse(annotation)).toMatchObject({
      kind: 'OCIRepository',
      metadata: { name: 'my-agent', namespace: 'org-giantswarm' },
    });
  });

  it('does not attempt to create a resource when patching fails', async () => {
    const client = {
      read: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockRejectedValue(new Error('forbidden')),
      create: jest.fn(),
    };
    const { action } = makeAction(client);

    await expect(
      action.handler(makeContext({ manifest: MANIFEST })),
    ).rejects.toThrow('forbidden');
    expect(client.create).not.toHaveBeenCalled();
  });

  it('propagates create failures', async () => {
    const client = {
      read: jest.fn().mockRejectedValue(new Error('not found')),
      patch: jest.fn(),
      create: jest.fn().mockRejectedValue(new Error('forbidden')),
    };
    const { action } = makeAction(client);

    await expect(
      action.handler(makeContext({ manifest: MANIFEST })),
    ).rejects.toThrow('forbidden');
  });
});
