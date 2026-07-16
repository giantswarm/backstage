import { KustomizationTreeNode } from './KustomizationTreeBuilder/KustomizationTreeBuilder';

/**
 * Prunes the tree to the paths that lead to failing resources. A node is kept
 * if it is failing itself or has a failing descendant; its children are
 * pruned recursively.
 */
export function filterTreeToFailingPaths(
  tree: KustomizationTreeNode[],
): KustomizationTreeNode[] {
  return tree.flatMap(node => {
    if (!node.nodeData.isFailing && !node.nodeData.hasFailingDescendants) {
      return [];
    }

    const children = filterTreeToFailingPaths(node.children);

    return [
      {
        ...node,
        children,
        nodeData: {
          ...node.nodeData,
          hasChildren: children.length > 0,
          hasChildrenInCompactView: children.some(c => c.displayInCompactView),
        },
      },
    ];
  });
}
