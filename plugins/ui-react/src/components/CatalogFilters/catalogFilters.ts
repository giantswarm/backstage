/**
 * Faceted filters over a catalog list (the shell's Customize tabs, and the
 * skill step of the agent wizard): each facet reads one value off an item, the
 * person picks at most one value per facet, and every facet's counts are taken
 * over the search and the OTHER facets' picks — so a chip says what picking it
 * would leave.
 */

/** The option that picks every value of a facet. */
export const ALL_FILTER_VALUES = '__all__';

/**
 * A facet with more options than this is a select rather than a row of chips:
 * six chips read at a glance, thirty models do not.
 */
export const FILTER_CHIPS_MAX = 6;

/**
 * The class the agent-platform shell's stylesheet restyles a chip row by (the
 * sessions list's state chips use it too), so every chip row in the shell
 * looks the same. Renaming it silently drops that styling.
 */
export const FILTER_CHIPS_CLASS_NAME = 'agent-platform-state-filter';

export type CatalogFacet<T> = {
  id: string;
  /** What the facet is about, shown before its chips: "Source". */
  label: string;
  /** The one value an item has on this facet; undefined when it has none. */
  value: (item: T) => string | undefined;
  /** How a value reads on its chip; the value itself by default. */
  optionLabel?: (value: string) => string;
  /**
   * The order the options are offered in. Values it does not name follow, by
   * label. Without it: the most common value first, then by label.
   */
  order?: readonly string[];
};

/** The picked value per facet id; a missing or undefined entry picks all. */
export type CatalogFilterSelection = Readonly<
  Record<string, string | undefined>
>;

export type CatalogFilterOption = {
  id: string;
  label: string;
  /** How many items picking this option would leave. */
  count: number;
};

/** One facet as a filter bar draws it. */
export type CatalogFilterDimension = {
  id: string;
  label: string;
  options: CatalogFilterOption[];
  /** What the "All" option leaves: the search and the other facets' picks. */
  total: number;
  /** The picked option, if any. */
  value?: string;
};

function matchesFacets<T>(
  item: T,
  facets: readonly CatalogFacet<T>[],
  selection: CatalogFilterSelection,
  except?: string,
): boolean {
  return facets.every(facet => {
    const picked = selection[facet.id];
    return (
      facet.id === except ||
      picked === undefined ||
      facet.value(item) === picked
    );
  });
}

/** The items every picked value keeps. */
export function applyCatalogFilters<T>(
  items: readonly T[],
  facets: readonly CatalogFacet<T>[],
  selection: CatalogFilterSelection,
): T[] {
  return items.filter(item => matchesFacets(item, facets, selection));
}

/** Whether any facet has a value picked. */
export function isCatalogFiltered(selection: CatalogFilterSelection): boolean {
  return Object.values(selection).some(value => value !== undefined);
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
 * The facets worth drawing, with their options and counts.
 *
 * A facet shows only when picking one of its values would change the whole
 * catalog's list — one source repository, or no favorite yet, is no filter
 * (three skills from one repository get no Source chips) — and stays while a
 * value is picked, so a pick can always be undone. Its options are the
 * catalog's values (not the search's, so chips do not come and go while
 * typing); each count is over the search and the other facets' picks.
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
    const picked = selection[facet.id];
    const catalogCounts = countValues(items, facet);
    const discriminates = [...catalogCounts.values()].some(
      count => count > 0 && count < items.length,
    );
    if (!discriminates && picked === undefined) {
      continue;
    }
    const narrowed = searched.filter(item =>
      matchesFacets(item, facets, selection, facet.id),
    );
    const counts = countValues(narrowed, facet);
    const ids = new Set(catalogCounts.keys());
    if (picked !== undefined) {
      // A picked value the catalog no longer holds stays offered, at zero,
      // so the pick that empties the list can be undone.
      ids.add(picked);
    }
    const options = [...ids].map(id => ({
      id,
      label: facet.optionLabel?.(id) ?? id,
      count: counts.get(id) ?? 0,
    }));
    dimensions.push({
      id: facet.id,
      label: facet.label,
      options: sortOptions(facet, catalogCounts, options),
      total: narrowed.length,
      ...(picked !== undefined ? { value: picked } : {}),
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
    .filter(id => selection[id] !== undefined)
    .sort()
    .map(id => `${id}=${selection[id]}`)
    .join('&');
}
