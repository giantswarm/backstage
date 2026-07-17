import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { KustomizationTreeBuilder } from './KustomizationTreeBuilder';

type InventoryRef = {
  namespace: string;
  name: string;
  group: string;
  kind: string;
};

function inventoryEntry({ namespace, name, group, kind }: InventoryRef) {
  return { id: `${namespace}_${name}_${group}_${kind}`, v: 'v1' };
}

function createMockKustomization(options: {
  name: string;
  namespace?: string;
  inventory?: InventoryRef[];
  readyCondition?: { status: 'True' | 'False' | 'Unknown'; message?: string };
  suspend?: boolean;
}): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: options.name,
      namespace: options.namespace ?? 'flux-system',
    },
    spec: {
      suspend: options.suspend,
    },
    status: {
      inventory: options.inventory
        ? { entries: options.inventory.map(inventoryEntry) }
        : undefined,
      conditions: options.readyCondition
        ? [
            {
              type: 'Ready',
              status: options.readyCondition.status,
              reason: 'ReconciliationFailed',
              message: options.readyCondition.message ?? '',
              lastTransitionTime: '2026-01-01T00:00:00Z',
            },
          ]
        : undefined,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

function createMockHelmRelease(options: {
  name: string;
  namespace?: string;
  readyCondition?: { status: 'True' | 'False' | 'Unknown' };
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: options.name,
      namespace: options.namespace ?? 'default',
    },
    spec: {},
    status: options.readyCondition
      ? {
          conditions: [
            {
              type: 'Ready',
              status: options.readyCondition.status,
              reason: 'ReconciliationFailed',
              message: '',
              lastTransitionTime: '2026-01-01T00:00:00Z',
            },
          ],
        }
      : undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

const KUSTOMIZATION_GROUP = 'kustomize.toolkit.fluxcd.io';
const HELM_RELEASE_GROUP = 'helm.toolkit.fluxcd.io';

function buildFixtureTree(options: {
  helmReleaseReadyStatus: 'True' | 'False';
}) {
  // root -> mid -> leaf HelmRelease, plus a healthy sibling under root
  const root = createMockKustomization({
    name: 'root',
    readyCondition: { status: 'True' },
    inventory: [
      {
        namespace: 'flux-system',
        name: 'mid',
        group: KUSTOMIZATION_GROUP,
        kind: 'Kustomization',
      },
      {
        namespace: 'flux-system',
        name: 'sibling',
        group: KUSTOMIZATION_GROUP,
        kind: 'Kustomization',
      },
    ],
  });
  const mid = createMockKustomization({
    name: 'mid',
    readyCondition: { status: 'True' },
    inventory: [
      {
        namespace: 'default',
        name: 'my-app',
        group: HELM_RELEASE_GROUP,
        kind: 'HelmRelease',
      },
    ],
  });
  const sibling = createMockKustomization({
    name: 'sibling',
    readyCondition: { status: 'True' },
  });
  const helmRelease = createMockHelmRelease({
    name: 'my-app',
    readyCondition: { status: options.helmReleaseReadyStatus },
  });

  const builder = new KustomizationTreeBuilder(
    [root, mid, sibling],
    [helmRelease],
    [],
    [],
    [],
  );

  return builder.buildTree();
}

function findNode(
  nodes: ReturnType<KustomizationTreeBuilder['buildTree']>,
  name: string,
): ReturnType<KustomizationTreeBuilder['buildTree']>[number] | undefined {
  for (const node of nodes) {
    if (node.nodeData.name === name) {
      return node;
    }
    const found = findNode(node.children, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

describe('KustomizationTreeBuilder', () => {
  it('builds the tree from Kustomization inventories', () => {
    const tree = buildFixtureTree({ helmReleaseReadyStatus: 'True' });

    expect(tree).toHaveLength(1);
    expect(tree[0].nodeData.name).toEqual('root');
    expect(tree[0].children.map(c => c.nodeData.name)).toEqual([
      'mid',
      'sibling',
    ]);
    expect(findNode(tree, 'my-app')).toBeDefined();
  });

  describe('self-managed root kustomizations', () => {
    it('keeps a self-referencing kustomization as root and hides the self-child', () => {
      // A self-managed root (Flux bootstrap pattern) lists itself in its own
      // inventory. It must still be a root — otherwise the whole tree
      // disappears — and it must not show up as its own child.
      const root = createMockKustomization({
        name: 'gitops',
        readyCondition: { status: 'True' },
        inventory: [
          {
            namespace: 'flux-system',
            name: 'gitops',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
          {
            namespace: 'flux-system',
            name: 'child',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
        ],
      });
      const child = createMockKustomization({
        name: 'child',
        readyCondition: { status: 'True' },
      });

      const builder = new KustomizationTreeBuilder(
        [root, child],
        [],
        [],
        [],
        [],
      );
      const tree = builder.buildTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].nodeData.name).toEqual('gitops');
      expect(tree[0].children.map(c => c.nodeData.name)).toEqual(['child']);
    });

    it('matches inventory references by namespace and name', () => {
      // A kustomization in another namespace that happens to share a name
      // with an inventory entry must not lose its root status.
      const root = createMockKustomization({
        name: 'apps',
        namespace: 'org-a',
        readyCondition: { status: 'True' },
        inventory: [
          {
            namespace: 'org-a',
            name: 'child',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
        ],
      });
      const sameNameOtherNamespace = createMockKustomization({
        name: 'child',
        namespace: 'org-b',
        readyCondition: { status: 'True' },
      });
      const child = createMockKustomization({
        name: 'child',
        namespace: 'org-a',
        readyCondition: { status: 'True' },
      });

      const builder = new KustomizationTreeBuilder(
        [root, child, sameNameOtherNamespace],
        [],
        [],
        [],
        [],
      );
      const tree = builder.buildTree();

      expect(tree.map(node => node.nodeData.name).sort()).toEqual([
        'apps',
        'child',
      ]);
      expect(
        tree.find(node => node.nodeData.name === 'child')?.nodeData.namespace,
      ).toEqual('org-b');
    });
  });

  describe('failing status rollup', () => {
    it('marks a failing leaf and all its ancestors', () => {
      const tree = buildFixtureTree({ helmReleaseReadyStatus: 'False' });

      const leaf = findNode(tree, 'my-app');
      expect(leaf?.nodeData.isFailing).toBe(true);
      expect(leaf?.nodeData.hasFailingDescendants).toBe(false);

      const mid = findNode(tree, 'mid');
      expect(mid?.nodeData.isFailing).toBe(false);
      expect(mid?.nodeData.hasFailingDescendants).toBe(true);

      const root = findNode(tree, 'root');
      expect(root?.nodeData.isFailing).toBe(false);
      expect(root?.nodeData.hasFailingDescendants).toBe(true);
    });

    it('does not mark siblings of a failing path', () => {
      const tree = buildFixtureTree({ helmReleaseReadyStatus: 'False' });

      const sibling = findNode(tree, 'sibling');
      expect(sibling?.nodeData.isFailing).toBe(false);
      expect(sibling?.nodeData.hasFailingDescendants).toBe(false);
    });

    it('marks nothing when the whole tree is healthy', () => {
      const tree = buildFixtureTree({ helmReleaseReadyStatus: 'True' });

      for (const name of ['root', 'mid', 'sibling', 'my-app']) {
        const node = findNode(tree, name);
        expect(node?.nodeData.isFailing).toBe(false);
        expect(node?.nodeData.hasFailingDescendants).toBe(false);
      }
    });

    it('does not count suspended-while-failing resources as failing', () => {
      // Suspended resources keep their last Ready condition frozen, so a
      // resource suspended in a failing state must not light up ancestors.
      const root = createMockKustomization({
        name: 'root',
        readyCondition: { status: 'True' },
        inventory: [
          {
            namespace: 'flux-system',
            name: 'suspended',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
        ],
      });
      const suspended = createMockKustomization({
        name: 'suspended',
        suspend: true,
        readyCondition: { status: 'False', message: 'was failing' },
      });

      const builder = new KustomizationTreeBuilder(
        [root, suspended],
        [],
        [],
        [],
        [],
      );
      const tree = builder.buildTree();

      expect(findNode(tree, 'suspended')?.nodeData.isFailing).toBe(false);
      expect(findNode(tree, 'root')?.nodeData.hasFailingDescendants).toBe(
        false,
      );
    });

    it('terminates on circular inventories', () => {
      // root -> a -> b -> a (cycle)
      const root = createMockKustomization({
        name: 'root',
        readyCondition: { status: 'True' },
        inventory: [
          {
            namespace: 'flux-system',
            name: 'a',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
        ],
      });
      const a = createMockKustomization({
        name: 'a',
        readyCondition: { status: 'True' },
        inventory: [
          {
            namespace: 'flux-system',
            name: 'b',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
        ],
      });
      const b = createMockKustomization({
        name: 'b',
        readyCondition: { status: 'False' },
        inventory: [
          {
            namespace: 'flux-system',
            name: 'a',
            group: KUSTOMIZATION_GROUP,
            kind: 'Kustomization',
          },
        ],
      });

      const builder = new KustomizationTreeBuilder(
        [root, a, b],
        [],
        [],
        [],
        [],
      );
      const tree = builder.buildTree();

      const failingNode = findNode(tree, 'b');
      expect(failingNode?.nodeData.isFailing).toBe(true);
      const parent = findNode(tree, 'a');
      expect(parent?.nodeData.hasFailingDescendants).toBe(true);
      expect(findNode(tree, 'root')?.nodeData.hasFailingDescendants).toBe(true);
    });
  });
});
