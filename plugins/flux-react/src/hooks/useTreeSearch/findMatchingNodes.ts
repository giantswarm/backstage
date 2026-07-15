import { KustomizationTreeNode } from '../../components/FluxOverview/utils/KustomizationTreeBuilder';

export type SearchResult = {
  matches: string[];
  pathsToExpand: Set<string>;
};

function getFailureMessage(node: KustomizationTreeNode): string | undefined {
  const readyCondition = node.nodeData.resource?.findReadyCondition();
  if (readyCondition?.status !== 'False') {
    // Only failure messages are searchable. Messages of healthy resources
    // (e.g. "Applied revision main@sha1:...") would match almost any query.
    return undefined;
  }

  return readyCondition.message;
}

/**
 * Finds tree nodes matching the query by resource name or, for failing
 * resources, by the Ready condition message. The latter lets users find the
 * Kustomization that fails to apply a resource by searching for the resource's
 * name, which Flux includes in its build/apply error messages.
 */
export function findMatchingNodes(
  tree: KustomizationTreeNode[],
  query: string,
  compactView: boolean,
): SearchResult {
  const matches: string[] = [];
  const pathsToExpand = new Set<string>();
  const normalizedQuery = query.toLowerCase();

  function traverse(nodes: KustomizationTreeNode[], parentIds: string[]) {
    for (const node of nodes) {
      if (compactView && !node.displayInCompactView) {
        continue;
      }

      const nodeName = node.nodeData.name.toLowerCase();
      const failureMessage = getFailureMessage(node)?.toLowerCase();
      if (
        nodeName.includes(normalizedQuery) ||
        failureMessage?.includes(normalizedQuery)
      ) {
        matches.push(node.id);
        // Mark all ancestors for expansion
        parentIds.forEach(id => pathsToExpand.add(id));
      }

      if (node.children.length > 0) {
        traverse(node.children, [...parentIds, node.id]);
      }
    }
  }

  traverse(tree, []);
  return { matches, pathsToExpand };
}
