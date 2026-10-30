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
import { useSharedTags } from './sharedTags';
import { TAGS_FACET_ID } from './tagsFacet';

export type UseCatalogFiltersOptions<T> = {
  /** The whole catalog, unsearched: decides which values each facet offers. */
  items: readonly T[];
  /** The catalog narrowed by the search: what the picks then narrow further. */
  searched: readonly T[];
  /** Keep the array stable (`useMemo`); a new one recomputes every count. */
  facets: readonly CatalogFacet<T>[];
  /** The picks to start with, e.g. read from the address; read once. */
  initialSelection?: CatalogFilterSelection;
};

export type CatalogFilters<T> = {
  /** The searched items every facet's picks keep. */
  filtered: T[];
  /** The facets to draw; hand them to `CatalogFilterBar`. */
  dimensions: CatalogFilterDimension[];
  selection: CatalogFilterSelection;
  /** Whether any facet has a value picked. */
  isFiltered: boolean;
  /** Sets a facet's picked values; an empty list picks all of it again. */
  select: (facetId: string, values: readonly string[]) => void;
  clear: () => void;
  /** Changes with the picks: key a windowed list on it. */
  key: string;
};

/**
 * The state of a catalog's filter bar: the picks, and what they leave.
 * Counts and the facets drawn follow {@link catalogFilterDimensions}.
 *
 * Under a `SharedTagsProvider`, a catalog with a Tags facet starts from the
 * shared tags (unless `initialSelection` picks tags itself) and writes its
 * Tags picks back, so the next catalog on the page opens with them.
 */
export function useCatalogFilters<T>({
  items,
  searched,
  facets,
  initialSelection,
}: UseCatalogFiltersOptions<T>): CatalogFilters<T> {
  const sharedTags = useSharedTags();
  const shared = facets.some(facet => facet.id === TAGS_FACET_ID)
    ? sharedTags
    : undefined;
  const [selection, setSelection] = useState<CatalogFilterSelection>(() => {
    const initial = initialSelection ?? {};
    if (!shared || shared.tags.length === 0 || initial[TAGS_FACET_ID]?.length) {
      return initial;
    }
    return { ...initial, [TAGS_FACET_ID]: [...shared.tags] };
  });
  const filtered = useMemo(
    () => applyCatalogFilters(searched, facets, selection),
    [searched, facets, selection],
  );
  const dimensions = useMemo(
    () => catalogFilterDimensions(items, searched, facets, selection),
    [items, searched, facets, selection],
  );
  const setSharedTags = shared?.setTags;
  const select = useCallback(
    (facetId: string, values: readonly string[]) => {
      setSelection(current => ({ ...current, [facetId]: [...values] }));
      if (facetId === TAGS_FACET_ID) {
        setSharedTags?.(values);
      }
    },
    [setSharedTags],
  );
  const clear = useCallback(() => {
    setSelection({});
    setSharedTags?.([]);
  }, [setSharedTags]);
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
