import { useCallback, useMemo, useState } from 'react';
import {
  applyCatalogFilters,
  type CatalogFacet,
  catalogFilterDimensions,
  type CatalogFilterDimension,
  catalogFilterKey,
  type CatalogFilterSelection,
  isCatalogFiltered,
} from './catalogFilters';

export type UseCatalogFiltersOptions<T> = {
  /** The whole catalog, unsearched: decides which facets can discriminate. */
  items: readonly T[];
  /** The catalog narrowed by the search: what the picks then narrow further. */
  searched: readonly T[];
  /** Keep the array stable (`useMemo`); a new one recomputes every count. */
  facets: readonly CatalogFacet<T>[];
};

export type CatalogFilters<T> = {
  /** The searched items every pick keeps. */
  filtered: T[];
  /** The facets worth drawing; hand them to `CatalogFilterBar`. */
  dimensions: CatalogFilterDimension[];
  selection: CatalogFilterSelection;
  /** Whether any facet has a value picked. */
  isFiltered: boolean;
  /** Picks `value` on a facet; `undefined` picks all of it again. */
  select: (facetId: string, value: string | undefined) => void;
  clear: () => void;
  /** Changes with the picks: key a windowed list on it. */
  key: string;
};

/**
 * The state of a catalog's filter bar: the picks, and what they leave.
 * Counts and the facets' visibility follow {@link catalogFilterDimensions}.
 */
export function useCatalogFilters<T>({
  items,
  searched,
  facets,
}: UseCatalogFiltersOptions<T>): CatalogFilters<T> {
  const [selection, setSelection] = useState<CatalogFilterSelection>({});
  const filtered = useMemo(
    () => applyCatalogFilters(searched, facets, selection),
    [searched, facets, selection],
  );
  const dimensions = useMemo(
    () => catalogFilterDimensions(items, searched, facets, selection),
    [items, searched, facets, selection],
  );
  const select = useCallback(
    (facetId: string, value: string | undefined) =>
      setSelection(current => ({ ...current, [facetId]: value })),
    [],
  );
  const clear = useCallback(() => setSelection({}), []);
  return {
    filtered,
    dimensions,
    selection,
    isFiltered: isCatalogFiltered(selection),
    select,
    clear,
    key: catalogFilterKey(selection),
  };
}
