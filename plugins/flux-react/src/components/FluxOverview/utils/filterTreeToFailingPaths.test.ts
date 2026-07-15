import { filterTreeToFailingPaths } from './filterTreeToFailingPaths';
import { KustomizationTreeNode } from './KustomizationTreeBuilder/KustomizationTreeBuilder';

function createNode(options: {
  name: string;
  isFailing?: boolean;
  hasFailingDescendants?: boolean;
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
      hasChildren: children.length > 0,
      hasChildrenInCompactView: children.some(c => c.displayInCompactView),
      isFailing: options.isFailing ?? false,
      hasFailingDescendants: options.hasFailingDescendants ?? false,
    },
    children,
    displayInCompactView: options.displayInCompactView ?? true,
  };
}

describe('filterTreeToFailingPaths', () => {
  it('removes healthy trees entirely', () => {
    const tree = [
      createNode({
        name: 'root',
        children: [createNode({ name: 'child' })],
      }),
    ];

    expect(filterTreeToFailingPaths(tree)).toEqual([]);
  });

  it('keeps only the paths that lead to failing nodes', () => {
    const tree = [
      createNode({
        name: 'root',
        hasFailingDescendants: true,
        children: [
          createNode({
            name: 'failing-path',
            hasFailingDescendants: true,
            children: [
              createNode({ name: 'failing-leaf', isFailing: true }),
              createNode({ name: 'healthy-leaf' }),
            ],
          }),
          createNode({ name: 'healthy-sibling' }),
        ],
      }),
      createNode({ name: 'healthy-root' }),
    ];

    const filtered = filterTreeToFailingPaths(tree);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].nodeData.name).toEqual('root');
    expect(filtered[0].children).toHaveLength(1);
    expect(filtered[0].children[0].nodeData.name).toEqual('failing-path');
    expect(filtered[0].children[0].children.map(c => c.nodeData.name)).toEqual([
      'failing-leaf',
    ]);
  });

  it('keeps a failing node and prunes its healthy children', () => {
    const tree = [
      createNode({
        name: 'failing-root',
        isFailing: true,
        children: [createNode({ name: 'healthy-child' })],
      }),
    ];

    const filtered = filterTreeToFailingPaths(tree);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].children).toEqual([]);
    expect(filtered[0].nodeData.hasChildren).toBe(false);
    expect(filtered[0].nodeData.hasChildrenInCompactView).toBe(false);
  });

  it('does not mutate the input tree', () => {
    const tree = [
      createNode({
        name: 'root',
        hasFailingDescendants: true,
        children: [
          createNode({ name: 'failing', isFailing: true }),
          createNode({ name: 'healthy' }),
        ],
      }),
    ];

    filterTreeToFailingPaths(tree);

    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].nodeData.hasChildren).toBe(true);
  });
});
