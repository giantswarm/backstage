import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { KustomizationTreeNode } from '../../components/FluxOverview/utils/KustomizationTreeBuilder';
import { findMatchingNodes } from './findMatchingNodes';

function createMockKustomization(options: {
  name: string;
  readyCondition?: { status: 'True' | 'False' | 'Unknown'; message: string };
}): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: options.name,
      namespace: 'flux-system',
    },
    spec: {},
    status: options.readyCondition
      ? {
          conditions: [
            {
              type: 'Ready',
              status: options.readyCondition.status,
              reason: 'ReconciliationFailed',
              message: options.readyCondition.message,
              lastTransitionTime: '2026-01-01T00:00:00Z',
            },
          ],
        }
      : undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

function createNode(options: {
  name: string;
  resource?: Kustomization;
  children?: KustomizationTreeNode[];
  displayInCompactView?: boolean;
}): KustomizationTreeNode {
  const children = options.children ?? [];

  return {
    id: `test-cluster-Kustomization-flux-system-${options.name}`,
    nodeData: {
      label: options.name,
      kind: 'Kustomization',
      name: options.name,
      namespace: 'flux-system',
      cluster: 'test-cluster',
      resource: options.resource,
      hasChildren: children.length > 0,
      hasChildrenInCompactView: children.some(c => c.displayInCompactView),
    },
    children,
    displayInCompactView: options.displayInCompactView ?? true,
  };
}

describe('findMatchingNodes', () => {
  it('matches nodes by name', () => {
    const tree = [
      createNode({ name: 'apps' }),
      createNode({ name: 'infrastructure' }),
    ];

    const result = findMatchingNodes(tree, 'apps', false);

    expect(result.matches).toEqual([
      'test-cluster-Kustomization-flux-system-apps',
    ]);
  });

  it('matches failing nodes by their Ready condition message', () => {
    const tree = [
      createNode({
        name: 'apps',
        resource: createMockKustomization({
          name: 'apps',
          readyCondition: {
            status: 'False',
            message:
              'MyService/default/my-new-service dry-run failed: the CRD is invalid',
          },
        }),
      }),
    ];

    const result = findMatchingNodes(tree, 'my-new-service', false);

    expect(result.matches).toEqual([
      'test-cluster-Kustomization-flux-system-apps',
    ]);
  });

  it('does not match messages of healthy resources', () => {
    const tree = [
      createNode({
        name: 'apps',
        resource: createMockKustomization({
          name: 'apps',
          readyCondition: {
            status: 'True',
            message: 'Applied revision: main@sha1:my-new-service-abc',
          },
        }),
      }),
    ];

    const result = findMatchingNodes(tree, 'my-new-service', false);

    expect(result.matches).toEqual([]);
  });

  it('marks ancestors of a message match for expansion', () => {
    const failing = createNode({
      name: 'child',
      resource: createMockKustomization({
        name: 'child',
        readyCondition: {
          status: 'False',
          message: 'MyService/default/my-new-service not found',
        },
      }),
    });
    const tree = [createNode({ name: 'root', children: [failing] })];

    const result = findMatchingNodes(tree, 'my-new-service', false);

    expect(result.matches).toEqual([
      'test-cluster-Kustomization-flux-system-child',
    ]);
    expect(
      result.pathsToExpand.has('test-cluster-Kustomization-flux-system-root'),
    ).toBe(true);
  });

  it('skips nodes hidden in compact view', () => {
    const tree = [
      createNode({
        name: 'my-new-service',
        displayInCompactView: false,
      }),
    ];

    expect(findMatchingNodes(tree, 'my-new-service', true).matches).toEqual([]);
    expect(findMatchingNodes(tree, 'my-new-service', false).matches).toEqual([
      'test-cluster-Kustomization-flux-system-my-new-service',
    ]);
  });

  it('matches case-insensitively', () => {
    const tree = [
      createNode({
        name: 'apps',
        resource: createMockKustomization({
          name: 'apps',
          readyCondition: {
            status: 'False',
            message: 'MyService/default/My-New-Service invalid',
          },
        }),
      }),
    ];

    expect(findMatchingNodes(tree, 'my-new-service', false).matches).toEqual([
      'test-cluster-Kustomization-flux-system-apps',
    ]);
  });
});
