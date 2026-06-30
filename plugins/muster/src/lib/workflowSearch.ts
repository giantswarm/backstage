/**
 * Token-boundary search matching for the Workflows table quick-search.
 *
 * Splitting on non-alphanumeric boundaries means a query like "dex" matches
 * "dex-error-rate" (token `dex`) but NOT "index_stats" (tokens `index`,
 * `stats`) -- the F3 behaviour the previous relevance search guaranteed. The
 * shared `@backstage/core-components` Table only filters (it cannot re-order
 * rows by a relevance score), so relevance ranking is intentionally dropped;
 * only the boundary-aware *matching* is preserved here.
 */

/** Lowercase and split on any run of non-alphanumeric characters. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Whether `text` matches `query` on token boundaries: every query token must be
 * a prefix of some token in the text (AND semantics). A blank query matches
 * everything.
 */
export function matchesQuery(query: string, text: string): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return true;
  }

  const textTokens = tokenize(text);
  return queryTokens.every(queryToken =>
    textTokens.some(textToken => textToken.startsWith(queryToken)),
  );
}
