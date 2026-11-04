import type { CatalogFacet } from './catalogFilters';

/** The Tags facet's id, and the query parameter that picks in it. */
export const TAGS_FACET_ID = 'tags';

/**
 * The Tags facet every catalog tab shows, after its own facets: an item is
 * kept when it carries any picked tag. Untagged is a state of its own, so one
 * tag in use still narrows the list.
 */
export function tagsFacet<T>(
  getTags: (item: T) => readonly string[],
): CatalogFacet<T> {
  return {
    id: TAGS_FACET_ID,
    label: 'Tags',
    value: getTags,
    missingIsChoice: true,
  };
}
