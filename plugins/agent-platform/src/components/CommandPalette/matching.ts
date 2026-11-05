/**
 * The palette's forgiving match (T15, U17): "swarmoperator", "swarm-operator",
 * "Swarm Operator" and "swarm_operator" all find the Swarm Operator agent, and
 * a name still matches with one typo. Results are ranked so the forgiving
 * matches never push an exact one down.
 */

/**
 * How well a candidate matches, best first. A candidate matches at its best
 * rank; the palette sorts each group by it, keeping the list's own order
 * (recency, name) among equals.
 */
export const MATCH_RANK = {
  /** A name is the query. */
  exact: 0,
  /** A name starts with the query. */
  prefix: 1,
  /** A later word of a name starts with the query ("oper" in "Swarm Operator"). */
  wordPrefix: 2,
  /** The query is somewhere inside a name. */
  name: 3,
  /** The query is somewhere in a description or other detail. */
  detail: 4,
  /** A name matches the query with one typo. */
  fuzzy: 5,
} as const;

export type MatchRank = (typeof MATCH_RANK)[keyof typeof MATCH_RANK];

/**
 * The shortest query that may match with a typo. Below it, one edit away is
 * most of the word, and "test" would find "best", "text" and "rest".
 */
export const FUZZY_MIN_LENGTH = 5;

/** What separates the words of a name: ignored when matching. */
const SEPARATORS = /[\s_-]+/g;

/**
 * Lowercase, without accents ("Café" reads as "cafe") and without spaces,
 * hyphens and underscores, so the ways of writing a name compare equal.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(SEPARATORS, '');
}

/**
 * The normalised name from each word on: "Swarm Operator" gives
 * "swarmoperator" and "operator".
 */
function wordStarts(name: string): string[] {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(SEPARATORS)
    .filter(Boolean);
  return words.map((_, index) => words.slice(index).join(''));
}

/**
 * The fewest edits (insert, delete, substitute, or swap two neighbours) that
 * turn `needle` into some prefix of `target`. Capped: past `max` it returns
 * `max + 1`, as only "within max or not" matters.
 */
export function prefixEditDistance(
  needle: string,
  target: string,
  max: number,
): number {
  const n = needle.length;
  // A prefix longer than the needle plus the allowed edits can never be
  // within reach, so the target is cut there.
  const m = Math.min(target.length, n + max);
  // rows[i][j]: edits from needle[0, i) to target[0, j).
  const rows: number[][] = [];
  for (let i = 0; i <= n; i += 1) {
    rows.push([i]);
  }
  for (let j = 1; j <= m; j += 1) {
    rows[0][j] = j;
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = needle[i - 1] === target[j - 1] ? 0 : 1;
      let best = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        needle[i - 1] === target[j - 2] &&
        needle[i - 2] === target[j - 1]
      ) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = best;
    }
  }
  return Math.min(max + 1, ...rows[n]);
}

/**
 * How well `query` matches a candidate, or undefined when it does not.
 * `names` are what the candidate is called (title, technical name): matched
 * by exact, prefix, word and substring, and with one typo. `details` (a
 * description, a session's agent) match as a substring only: a typo
 * tolerance over prose would match nearly anything.
 */
export function matchRank(
  query: string,
  names: (string | undefined)[],
  details: (string | undefined)[] = [],
): MatchRank | undefined {
  const needle = normalizeForMatch(query);
  if (!needle) {
    return MATCH_RANK.exact;
  }
  let best: MatchRank | undefined;
  const consider = (rank: MatchRank) => {
    if (best === undefined || rank < best) {
      best = rank;
    }
  };

  const presentNames = names.filter((name): name is string => !!name);
  for (const name of presentNames) {
    const normalized = normalizeForMatch(name);
    if (normalized === needle) {
      return MATCH_RANK.exact;
    }
    if (normalized.startsWith(needle)) {
      consider(MATCH_RANK.prefix);
    } else if (
      wordStarts(name)
        .slice(1)
        .some(start => start.startsWith(needle))
    ) {
      consider(MATCH_RANK.wordPrefix);
    } else if (normalized.includes(needle)) {
      consider(MATCH_RANK.name);
    }
  }
  if (best !== undefined) {
    return best;
  }

  if (
    details.some(
      detail => !!detail && normalizeForMatch(detail).includes(needle),
    )
  ) {
    return MATCH_RANK.detail;
  }

  if (needle.length >= FUZZY_MIN_LENGTH) {
    const nearly = presentNames.some(name =>
      wordStarts(name).some(start => prefixEditDistance(needle, start, 1) <= 1),
    );
    if (nearly) {
      return MATCH_RANK.fuzzy;
    }
  }
  return undefined;
}
