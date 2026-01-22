import { useState, useMemo, useCallback } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { KustomizationTreeNode } from '../../components/FluxOverview/utils/KustomizationTreeBuilder';

const MIN_SEARCH_LENGTH = 3;
const DEBOUNCE_MS = 300;

type SearchResult = {
  matches: string[];
  pathsToExpand: Set<string>;
};

function findMatchingNodes(
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
      if (nodeName.includes(normalizedQuery)) {
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

export type UseTreeSearchOptions = {
  tree: KustomizationTreeNode[] | undefined;
  compactView: boolean;
};

export type UseTreeSearchResult = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchMatches: string[];
  pathsToExpand: Set<string>;
  currentMatchIndex: number;
  currentMatchId: string | undefined;
  navigateToNextMatch: () => void;
  navigateToPreviousMatch: () => void;
  totalMatches: number;
};

export function useTreeSearch({
  tree,
  compactView,
}: UseTreeSearchOptions): UseTreeSearchResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Debounce the search query
  useDebounce(
    () => {
      setDebouncedQuery(searchQuery);
      setCurrentMatchIndex(0);
    },
    DEBOUNCE_MS,
    [searchQuery],
  );

  // Compute matches when debounced query or tree changes
  const searchResult = useMemo<SearchResult>(() => {
    if (!tree || debouncedQuery.length < MIN_SEARCH_LENGTH) {
      return { matches: [], pathsToExpand: new Set() };
    }

    return findMatchingNodes(tree, debouncedQuery, compactView);
  }, [tree, debouncedQuery, compactView]);

  const { matches: searchMatches, pathsToExpand } = searchResult;
  const totalMatches = searchMatches.length;

  const navigateToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex(prev => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const navigateToPreviousMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  const currentMatchId = searchMatches[currentMatchIndex];

  return {
    searchQuery,
    setSearchQuery,
    searchMatches,
    pathsToExpand,
    currentMatchIndex,
    currentMatchId,
    navigateToNextMatch,
    navigateToPreviousMatch,
    totalMatches,
  };
}
