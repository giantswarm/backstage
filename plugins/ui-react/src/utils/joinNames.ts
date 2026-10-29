/**
 * How many names a sentence names before the rest become a count: on a fleet
 * of 50 installations, a note that names every one is a paragraph nobody
 * reads.
 */
export const NAMED_IN_SENTENCE = 5;

export type JoinNamesOptions = {
  /** How many to name before `and N more`. */
  max?: number;
  /** Between two names: `, ` by default; `; ` for entries that hold commas. */
  separator?: string;
};

/**
 * `a, b, c` — or, past {@link NAMED_IN_SENTENCE}, `a, b, c, d, e and 45 more`.
 * The full list belongs behind a disclosure next to the sentence.
 */
export function joinNames(
  names: readonly string[],
  { max = NAMED_IN_SENTENCE, separator = ', ' }: JoinNamesOptions = {},
): string {
  if (names.length <= max) {
    return names.join(separator);
  }
  return `${names.slice(0, max).join(separator)} and ${
    names.length - max
  } more`;
}

/** The names that share one label — a failure reason, say. */
export type NameGroup = { group: string; names: string[] };

/**
 * The entries' names grouped by a shared label, groups and names in the order
 * first seen: fifty installations failing for two reasons read as two
 * sentences, not fifty.
 */
export function groupNames<T>(
  entries: readonly T[],
  nameOf: (entry: T) => string,
  groupOf: (entry: T) => string,
): NameGroup[] {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const group = groupOf(entry);
    const names = groups.get(group);
    if (names) {
      names.push(nameOf(entry));
    } else {
      groups.set(group, [nameOf(entry)]);
    }
  }
  return Array.from(groups, ([group, names]) => ({ group, names }));
}
