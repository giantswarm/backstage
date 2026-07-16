import { KustomizationTreeNode } from '../../components/FluxOverview/utils/KustomizationTreeBuilder';

export type SearchResult = {
  matches: string[];
  pathsToExpand: Set<string>;
};

function getFailureMessage(node: KustomizationTreeNode): string | undefined {
  const resource = node.nodeData.resource;
  if (resource?.isSuspended()) {
    // A suspended resource keeps its last Ready condition frozen, so its
    // message may describe a stale failure. The rest of the UI tracks
    // suspended resources as inactive, not failing.
    return undefined;
  }

  const readyCondition = resource?.findReadyCondition();
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
 *
 * Note: message matching is plain substring search over free-form error text,
 * so short generic queries (e.g. "not", "run") match every failing resource
 * whose message contains them. This is an accepted trade-off — failing
 * resources are few, and scoping the match to the object-reference portion of
 * the message would be fragile across Flux error formats.
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
