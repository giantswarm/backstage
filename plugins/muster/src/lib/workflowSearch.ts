/**
 * Token-aware scored search for the workflow list. Replaces the previous naive
 * `name/description.includes(needle)` substring filter, which matched the query
 * "dex" against "in**dex**" so `loki-request-errors` / `memcached-low-hit-ratio`
 * (whose descriptions mention "index") polluted the results (workflows.md F3).
 *
 * Matching is on word/token boundaries: a query token matches a text token only
 * when it is a prefix of that token, so "dex" matches "dex-error-rate-high" but
 * not "index_stats". Every query token must match somewhere (name or
 * description) for the item to be kept (AND semantics). Name matches outrank
 * description matches and exact token matches outrank prefixes, yielding a
 * relevance order.
 */

const NAME_WEIGHT = 2;
const EXACT_SCORE = 3;
const PREFIX_SCORE = 2;

/** Lowercase and split on any run of non-alphanumeric characters. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Best boundary-aware score of one query token against a set of text tokens. */
function tokenScore(queryToken: string, textTokens: string[]): number {
  let best = 0;
  for (const t of textTokens) {
    if (t === queryToken) {
      return EXACT_SCORE;
    }
    if (t.startsWith(queryToken)) {
      best = PREFIX_SCORE;
    }
  }
  return best;
}

/**
 * Relevance score of a name/description pair against the (already tokenized)
 * query. Returns 0 when any query token fails to match either field, so a 0
 * score means "filtered out".
 */
export function searchScore(
  name: string,
  description: string,
  queryTokens: string[],
): number {
  const nameTokens = tokenize(name);
  const descTokens = tokenize(description);
  let total = 0;
  for (const q of queryTokens) {
    const nameScore = tokenScore(q, nameTokens);
    const best =
      nameScore > 0 ? nameScore * NAME_WEIGHT : tokenScore(q, descTokens);
    if (best === 0) {
      return 0;
    }
    total += best;
  }
  return total;
}

export interface SearchFields {
  name: string;
  description: string;
}

/**
 * Filter `items` to those matching `query` on token boundaries, ordered by
 * relevance (highest score first). An empty query returns the items unchanged
 * (original order preserved).
 */
export function searchByRelevance<T>(
  items: T[],
  query: string,
  getFields: (item: T) => SearchFields,
): T[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return items;
  }
  return items
    .map(item => {
      const { name, description } = getFields(item);
      return { item, score: searchScore(name, description, queryTokens) };
    })
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(scored => scored.item);
}
