import { useState, useMemo, useCallback } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { KustomizationTreeNode } from '../../components/FluxOverview/utils/KustomizationTreeBuilder';
import { findMatchingNodes, SearchResult } from './findMatchingNodes';

const MIN_SEARCH_LENGTH = 3;
const DEBOUNCE_MS = 300;

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
