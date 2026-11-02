/**
 * Faceted filters over a catalog list (the shell's Customize tabs, and the
 * skill step of the agent wizard): each facet reads one value off an item,
 * the person picks any number of values per facet — an item stays when it has
 * one of them — and the facets combine, an item staying only when every facet
 * with picks keeps it. Each option's count is taken over the search and the
 * OTHER facets' picks, so it says what picking it would add.
 */

export type CatalogFacet<T> = {
  id: string;
  /** What the facet is about, named on its dropdown: "Source". */
  label: string;
  /** The one value an item has on this facet; undefined when it has none. */
  value: (item: T) => string | undefined;
  /** How a value reads in the dropdown; the value itself by default. */
  optionLabel?: (value: string) => string;
  /**
   * The order the options are offered in. Values it does not name follow, by
   * label. Without it: the most common value first, then by label.
   */
  order?: readonly string[];
};

/**
 * The picked values per facet id. A missing, undefined or empty entry picks
 * every value of the facet.
 */
export type CatalogFilterSelection = Readonly<
  Record<string, readonly string[] | undefined>
>;

export type CatalogFilterOption = {
  id: string;
  label: string;
  /** How many items this option keeps, under the search and other picks. */
  count: number;
};

/** One facet as a filter bar draws it. */
export type CatalogFilterDimension = {
  id: string;
  label: string;
  options: CatalogFilterOption[];
  /** The picked option ids; empty when the facet keeps everything. */
  selected: string[];
};

function picksOf(
  selection: CatalogFilterSelection,
  facetId: string,
): readonly string[] {
  return selection[facetId] ?? [];
}

function matchesFacets<T>(
  item: T,
  facets: readonly CatalogFacet<T>[],
  selection: CatalogFilterSelection,
  except?: string,
): boolean {
  return facets.every(facet => {
    if (facet.id === except) {
      return true;
    }
    const picked = picksOf(selection, facet.id);
    if (picked.length === 0) {
      return true;
    }
    const value = facet.value(item);
    return value !== undefined && picked.includes(value);
  });
}

/** The items every facet's picks keep. */
export function applyCatalogFilters<T>(
  items: readonly T[],
  facets: readonly CatalogFacet<T>[],
  selection: CatalogFilterSelection,
): T[] {
  return items.filter(item => matchesFacets(item, facets, selection));
}

/** Whether any facet has a value picked. */
export function isCatalogFiltered(selection: CatalogFilterSelection): boolean {
  return Object.values(selection).some(
    values => values !== undefined && values.length > 0,
  );
}

function countValues<T>(
  items: readonly T[],
  facet: CatalogFacet<T>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = facet.value(item);
    if (value !== undefined) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function sortOptions<T>(
  facet: CatalogFacet<T>,
  catalogCounts: Map<string, number>,
  options: CatalogFilterOption[],
): CatalogFilterOption[] {
  const rank = (id: string) => {
    const index = facet.order?.indexOf(id) ?? -1;
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  return [...options].sort((a, b) => {
    if (facet.order) {
      const [rankA, rankB] = [rank(a.id), rank(b.id)];
      if (rankA !== rankB) {
        return rankA < rankB ? -1 : 1;
      }
    } else {
      const byCount =
        (catalogCounts.get(b.id) ?? 0) - (catalogCounts.get(a.id) ?? 0);
      if (byCount !== 0) {
        return byCount;
      }
    }
    return a.label.localeCompare(b.label);
  });
}

/**
 * The facets to draw, with their options and counts.
 *
 * Every facet some item has a value on is drawn, even when that is one value
 * for the whole catalog — a dropdown of one option still says where the
 * skills come from, and a facet that came and went with the catalog's shape
 * was missed (T64). A facet no item has a value on (no favorites yet) has
 * nothing to offer and is left out, unless a pick on it is still standing.
 * Its options are the catalog's values (not the search's, so options do not
 * come and go while typing); each count is over the search and the other
 * facets' picks.
 *
 * @param items the whole catalog, unsearched
 * @param searched the catalog narrowed by the search
 */
export function catalogFilterDimensions<T>(
  items: readonly T[],
  searched: readonly T[],
  facets: readonly CatalogFacet<T>[],
  selection: CatalogFilterSelection,
): CatalogFilterDimension[] {
  const dimensions: CatalogFilterDimension[] = [];
  for (const facet of facets) {
    const picked = picksOf(selection, facet.id);
    const catalogCounts = countValues(items, facet);
    // A picked value the catalog no longer holds stays offered, at zero, so
    // the pick that empties the list can be undone.
    const ids = new Set([...catalogCounts.keys(), ...picked]);
    if (ids.size === 0) {
      continue;
    }
    const narrowed = searched.filter(item =>
      matchesFacets(item, facets, selection, facet.id),
    );
    const counts = countValues(narrowed, facet);
    const options = [...ids].map(id => ({
      id,
      label: facet.optionLabel?.(id) ?? id,
      count: counts.get(id) ?? 0,
    }));
    dimensions.push({
      id: facet.id,
      label: facet.label,
      options: sortOptions(facet, catalogCounts, options),
      selected: [...picked],
    });
  }
  return dimensions;
}

/**
 * A short stable string for the current picks, to key a windowed list on so a
 * new filter starts again from the first page.
 */
export function catalogFilterKey(selection: CatalogFilterSelection): string {
  return Object.keys(selection)
    .filter(id => picksOf(selection, id).length > 0)
    .sort()
    .map(id => `${id}=${[...picksOf(selection, id)].sort().join(',')}`)
    .join('&');
}
