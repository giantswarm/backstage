import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  findBlockedAncestors,
  findKustomizationAncestors,
} from './findKustomizationAncestors';

function createMockKustomization(options: {
  name: string;
  namespace?: string;
  managedBy?: { name: string; namespace: string };
  readyCondition?: { status: 'True' | 'False' | 'Unknown'; message?: string };
  suspend?: boolean;
}): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: options.name,
      namespace: options.namespace ?? 'flux-system',
      labels: options.managedBy
        ? {
            'kustomize.toolkit.fluxcd.io/name': options.managedBy.name,
            'kustomize.toolkit.fluxcd.io/namespace':
              options.managedBy.namespace,
          }
        : undefined,
    },
    spec: {
      suspend: options.suspend,
    },
    status: options.readyCondition
      ? {
          conditions: [
            {
              type: 'Ready',
              status: options.readyCondition.status,
              reason: 'ReconciliationFailed',
              message: options.readyCondition.message ?? '',
              lastTransitionTime: '2026-01-01T00:00:00Z',
            },
          ],
        }
      : undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

function createMockHelmRelease(options: {
  name: string;
  managedBy?: { name: string; namespace: string };
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: options.name,
      namespace: 'default',
      labels: options.managedBy
        ? {
            'kustomize.toolkit.fluxcd.io/name': options.managedBy.name,
            'kustomize.toolkit.fluxcd.io/namespace':
              options.managedBy.namespace,
          }
        : undefined,
    },
    spec: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

describe('findKustomizationAncestors', () => {
  it('returns the chain from nearest parent to root', () => {
    const root = createMockKustomization({ name: 'root' });
    const mid = createMockKustomization({
      name: 'mid',
      managedBy: { name: 'root', namespace: 'flux-system' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'mid', namespace: 'flux-system' },
    });

    const ancestors = findKustomizationAncestors(helmRelease, [root, mid]);

    expect(ancestors.map(k => k.getName())).toEqual(['mid', 'root']);
  });

  it('returns an empty list for resources without Flux labels', () => {
    const root = createMockKustomization({ name: 'root' });
    const helmRelease = createMockHelmRelease({ name: 'my-app' });

    expect(findKustomizationAncestors(helmRelease, [root])).toEqual([]);
  });

  it('stops at a parent that is not in the given list', () => {
    const mid = createMockKustomization({
      name: 'mid',
      managedBy: { name: 'missing', namespace: 'flux-system' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'mid', namespace: 'flux-system' },
    });

    const ancestors = findKustomizationAncestors(helmRelease, [mid]);

    expect(ancestors.map(k => k.getName())).toEqual(['mid']);
  });

  it('terminates on self-referencing Kustomizations', () => {
    const fluxSystem = createMockKustomization({
      name: 'flux-system',
      managedBy: { name: 'flux-system', namespace: 'flux-system' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'flux-system', namespace: 'flux-system' },
    });

    const ancestors = findKustomizationAncestors(helmRelease, [fluxSystem]);

    expect(ancestors.map(k => k.getName())).toEqual(['flux-system']);
  });

  it('terminates on cycles', () => {
    const a = createMockKustomization({
      name: 'a',
      managedBy: { name: 'b', namespace: 'flux-system' },
    });
    const b = createMockKustomization({
      name: 'b',
      managedBy: { name: 'a', namespace: 'flux-system' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'a', namespace: 'flux-system' },
    });

    const ancestors = findKustomizationAncestors(helmRelease, [a, b]);

    expect(ancestors.map(k => k.getName())).toEqual(['a', 'b']);
  });

  it('distinguishes Kustomizations by namespace', () => {
    const other = createMockKustomization({
      name: 'apps',
      namespace: 'other-namespace',
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'apps', namespace: 'flux-system' },
    });

    expect(findKustomizationAncestors(helmRelease, [other])).toEqual([]);
  });
});

describe('findBlockedAncestors', () => {
  it('returns an empty list when the whole chain is healthy', () => {
    const root = createMockKustomization({
      name: 'root',
      readyCondition: { status: 'True' },
    });
    const mid = createMockKustomization({
      name: 'mid',
      managedBy: { name: 'root', namespace: 'flux-system' },
      readyCondition: { status: 'True' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'mid', namespace: 'flux-system' },
    });

    expect(findBlockedAncestors(helmRelease, [root, mid])).toEqual([]);
  });

  it('reports a failing ancestor with its Ready condition message', () => {
    const root = createMockKustomization({
      name: 'root',
      readyCondition: { status: 'True' },
    });
    const mid = createMockKustomization({
      name: 'mid',
      managedBy: { name: 'root', namespace: 'flux-system' },
      readyCondition: {
        status: 'False',
        message: 'MyResource/default/my-resource dry-run failed',
      },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'mid', namespace: 'flux-system' },
    });

    const blocked = findBlockedAncestors(helmRelease, [root, mid]);

    expect(blocked).toHaveLength(1);
    expect(blocked[0].kustomization.getName()).toEqual('mid');
    expect(blocked[0].reason).toEqual('not-ready');
    expect(blocked[0].message).toEqual(
      'MyResource/default/my-resource dry-run failed',
    );
  });

  it('reports a suspended ancestor', () => {
    const root = createMockKustomization({
      name: 'root',
      suspend: true,
      readyCondition: { status: 'True' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'root', namespace: 'flux-system' },
    });

    const blocked = findBlockedAncestors(helmRelease, [root]);

    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toEqual('suspended');
    expect(blocked[0].message).toBeUndefined();
  });

  it('orders multiple blocked ancestors nearest first, root last', () => {
    const root = createMockKustomization({
      name: 'root',
      readyCondition: { status: 'False', message: 'root failed' },
    });
    const mid = createMockKustomization({
      name: 'mid',
      managedBy: { name: 'root', namespace: 'flux-system' },
      readyCondition: { status: 'False', message: 'dependency not ready' },
    });
    const helmRelease = createMockHelmRelease({
      name: 'my-app',
      managedBy: { name: 'mid', namespace: 'flux-system' },
    });

    const blocked = findBlockedAncestors(helmRelease, [root, mid]);

    expect(blocked.map(({ kustomization }) => kustomization.getName())).toEqual(
      ['mid', 'root'],
    );
  });
});
