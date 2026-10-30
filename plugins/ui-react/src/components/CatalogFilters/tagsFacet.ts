import type { CatalogFacet } from './catalogFilters';

/**
 * The Tags facet every catalog tab shows, after its own facets: an item is
 * kept when it carries any picked tag.
 */
export function tagsFacet<T>(
  getTags: (item: T) => readonly string[],
): CatalogFacet<T> {
  return { id: 'tags', label: 'Tags', value: getTags };
}
