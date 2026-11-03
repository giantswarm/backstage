import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { parseTags } from '../../lib/tags';
import { TAGS_FACET_ID } from '../CatalogFilters/tagsFacet';

/**
 * The query parameter that opens a catalog with tags picked in its Tags
 * facet: `?tags=util,ops`. Read once, as `?q=` is, and never written back.
 */
export const TAGS_SEARCH_PARAM = TAGS_FACET_ID;

/**
 * The tags a query string picks (`?tags=a,b`), read as a stored value is
 * (`parseTags`): in order, lowercased, without repeats or invalid ones.
 */
export function tagsOfSearch(search: string): string[] {
  return parseTags(
    new URLSearchParams(search).get(TAGS_SEARCH_PARAM) ?? undefined,
  );
}

/**
 * `search` with its tags parameter set to `tags`, or dropped when there are
 * none: `?…` or the empty string.
 */
export function withTagsSearch(
  search: string,
  tags: readonly string[],
): string {
  const params = new URLSearchParams(search);
  if (tags.length > 0) {
    params.set(TAGS_SEARCH_PARAM, tags.join(','));
  } else {
    params.delete(TAGS_SEARCH_PARAM);
  }
  // Commas stay readable: a tag never holds one.
  const query = params.toString().replace(/%2C/gi, ',');
  return query ? `?${query}` : '';
}

/** A catalog list's address with one tag picked in its Tags facet. */
export function tagHref(listPath: string, tag: string): string {
  return `${listPath}${withTagsSearch('', [tag])}`;
}

type SharedTags = {
  tags: readonly string[];
  setTags: (tags: readonly string[]) => void;
};

const SharedTagsContext = createContext<SharedTags | undefined>(undefined);

/**
 * One Tags pick for every catalog below, so a page with several catalog tabs
 * (Customize) keeps it from tab to tab. A `useCatalogFilters` with a Tags
 * facet starts from these tags and writes its Tags picks back. Controlled:
 * the page holds the tags.
 */
export function SharedTagsProvider({
  tags,
  onTagsChange,
  children,
}: {
  tags: readonly string[];
  onTagsChange: (tags: readonly string[]) => void;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ tags, setTags: onTagsChange }),
    [tags, onTagsChange],
  );
  return (
    <SharedTagsContext.Provider value={value}>
      {children}
    </SharedTagsContext.Provider>
  );
}

/** The shared Tags pick, or undefined outside a {@link SharedTagsProvider}. */
export function useSharedTags(): SharedTags | undefined {
  return useContext(SharedTagsContext);
}
