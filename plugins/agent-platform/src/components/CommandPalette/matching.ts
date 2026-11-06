import { tokenize } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The palette's forgiving match (T15, U17): "swarmoperator", "swarm-operator",
 * "Swarm Operator" and "swarm_operator" all find the Swarm Operator agent, and
 * a name still matches with one typo. Results are ranked so the forgiving
 * matches never push an exact one down.
 *
 * Text is folded with ui-react's `tokenize`, as the shell's other searches
 * fold it: lowercase, without accents, split on anything that is not a
 * letter or a digit.
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
  /** A word of a description, or the words from it on, start with the query. */
  detail: 4,
  /** A word, or a run of words, of a name is the query with one typo. */
  fuzzy: 5,
} as const;

export type MatchRank = (typeof MATCH_RANK)[keyof typeof MATCH_RANK];

/**
 * The shortest query that may match with a typo. Below it, one edit away is
 * most of the word.
 */
export const FUZZY_MIN_LENGTH = 5;

/** A name, folded once for every query matched against it. */
type IndexedName = {
  /** All its words run together: "Swarm Operator" is "swarmoperator". */
  joined: string;
  /** The words from each word on, run together: "swarmoperator", "operator". */
  starts: string[];
  /** Every run of whole words, run together: "swarm", "swarmoperator", "operator". */
  runs: string[];
};

/** A candidate's text, folded once (see {@link indexForMatch}). */
export type MatchIndex = {
  names: IndexedName[];
  /** Each detail's words, space-separated and led by a space. */
  details: string[];
};

/** A query, folded once for every candidate it is matched against. */
export type MatchQuery = {
  /** The words run together, as names are compared. */
  joined: string;
  /** The words space-separated and led by a space, as details are compared. */
  spaced: string;
};

/**
 * Folds a candidate's text for {@link matchRankIn}. Called once per
 * candidate, not per keystroke.
 */
export function indexForMatch(
  names: (string | undefined)[],
  details: (string | undefined)[] = [],
): MatchIndex {
  return {
    names: names.flatMap(name => {
      const words = tokenize(name ?? '');
      if (words.length === 0) {
        return [];
      }
      const runs: string[] = [];
      for (let from = 0; from < words.length; from += 1) {
        for (let to = from + 1; to <= words.length; to += 1) {
          runs.push(words.slice(from, to).join(''));
        }
      }
      return [
        {
          joined: words.join(''),
          starts: words.map((_, from) => words.slice(from).join('')),
          runs,
        },
      ];
    }),
    details: details.flatMap(detail => {
      const words = tokenize(detail ?? '');
      return words.length > 0 ? [` ${words.join(' ')}`] : [];
    }),
  };
}

/** Folds a query for {@link matchRankIn}; undefined when it is blank. */
export function foldQuery(query: string): MatchQuery | undefined {
  const words = tokenize(query);
  if (words.length === 0) {
    return undefined;
  }
  return { joined: words.join(''), spaced: ` ${words.join(' ')}` };
}

/**
 * The fewest edits (insert, delete, substitute, or swap two neighbours) that
 * turn `a` into `b`. Capped: past `max` it returns `max + 1`, as only "within
 * max or not" matters, and it stops as soon as that is certain.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, before[j - 2] + 1);
      }
      current[j] = best;
      rowMin = Math.min(rowMin, best);
    }
    if (rowMin > max) {
      return max + 1;
    }
    before = previous;
    previous = current;
  }
  return Math.min(max + 1, previous[b.length]);
}

/**
 * How well a folded query matches an indexed candidate, or undefined when it
 * does not. Names (title, technical name) match by exact, prefix, word and
 * substring, and with one typo against a whole word or run of words: never
 * against part of a word, where a dropped or changed last letter would make
 * any query a shorter prefix ("model" finding "Modern"). Details (a
 * description, a session's agent) match where a word starts, as the shell's
 * other searches do, without a typo: a typo tolerance over prose would match
 * nearly anything.
 */
export function matchRankIn(
  query: MatchQuery,
  index: MatchIndex,
): MatchRank | undefined {
  const needle = query.joined;
  let best: MatchRank | undefined;
  for (const name of index.names) {
    if (name.joined === needle) {
      return MATCH_RANK.exact;
    }
    let rank: MatchRank | undefined;
    if (name.joined.startsWith(needle)) {
      rank = MATCH_RANK.prefix;
    } else if (name.starts.some(start => start.startsWith(needle))) {
      rank = MATCH_RANK.wordPrefix;
    } else if (name.joined.includes(needle)) {
      rank = MATCH_RANK.name;
    }
    if (rank !== undefined && (best === undefined || rank < best)) {
      best = rank;
    }
  }
  if (best !== undefined) {
    return best;
  }

  if (index.details.some(detail => detail.includes(query.spaced))) {
    return MATCH_RANK.detail;
  }

  if (
    needle.length >= FUZZY_MIN_LENGTH &&
    index.names.some(name =>
      name.runs.some(run => editDistance(needle, run, 1) <= 1),
    )
  ) {
    return MATCH_RANK.fuzzy;
  }
  return undefined;
}

/**
 * {@link matchRankIn} for a one-off match: folds the query and the text on
 * every call. A blank query matches, as exact.
 */
export function matchRank(
  query: string,
  names: (string | undefined)[],
  details: (string | undefined)[] = [],
): MatchRank | undefined {
  const folded = foldQuery(query);
  if (!folded) {
    return MATCH_RANK.exact;
  }
  return matchRankIn(folded, indexForMatch(names, details));
}
