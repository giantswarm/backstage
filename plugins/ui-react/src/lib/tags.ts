/**
 * Tags: free-form keywords people find an agent (or another resource) by
 * (`util`, `marketing`). Stored as the comma-joined `ui.giantswarm.io/tags`
 * annotation; agent-manager takes them as `tags` and checks the same form.
 */
export const TAGS_ANNOTATION = 'ui.giantswarm.io/tags';

/** The longest tag the charts take. */
export const MAX_TAG_LENGTH = 63;

/**
 * The charts' tag form: lowercase letters and digits, single `-` between.
 * The one tag rule the portal checks against; muster and gs-backend mirror it.
 */
export const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A tag as typed, in the stored form: lowercase, spaces and underscores as
 * `-`, other punctuation dropped, no repeated, leading or trailing `-`.
 * `" On_Call! "` is `on-call`. Letters outside a-z stay, so `über` is refused
 * rather than quietly stored as `ber`.
 */
export function normalizeTag(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Why a normalized tag cannot be stored, or undefined when it can. */
export function tagProblem(tag: string): string | undefined {
  if (tag.length > MAX_TAG_LENGTH) {
    return `Use at most ${MAX_TAG_LENGTH} characters.`;
  }
  if (!TAG_PATTERN.test(tag)) {
    return 'Use letters and numbers.';
  }
  return undefined;
}

/**
 * The tags in a stored annotation value: split on commas, trimmed and
 * lowercased, without empties or repeats. A value that is not a valid tag
 * (see {@link tagProblem}) is left out, so an edit never sends it back.
 */
export function parseTags(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tagProblem(tag) === undefined),
    ),
  ];
}

/** The parts of a typed text a comma separates, trimmed, without empties. */
export function splitTyped(text: string): string[] {
  return text
    .split(',')
    .map(part => part.trim())
    .filter(part => part !== '');
}

/**
 * A typed text's comma-separated parts: the tags it holds (normalized, valid)
 * and the parts that cannot be tags, as typed.
 */
export function splitDraft(text: string): {
  tags: string[];
  invalid: string[];
} {
  const tags: string[] = [];
  const invalid: string[] = [];
  for (const part of splitTyped(text)) {
    const tag = normalizeTag(part);
    if (tagProblem(tag) === undefined) {
      tags.push(tag);
    } else {
      invalid.push(part);
    }
  }
  return { tags, invalid };
}

/**
 * Why a typed but not yet added text cannot become tags: the first of its
 * comma-separated parts that cannot. Undefined when it can, or is empty.
 */
export function draftProblem(text: string): string | undefined {
  for (const part of splitTyped(text)) {
    const problem = tagProblem(normalizeTag(part));
    if (problem) {
      return problem;
    }
  }
  return undefined;
}

/** Whether two tag lists hold the same tags, in any order. */
export function sameTags(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return set.size === new Set(b).size && b.every(tag => set.has(tag));
}

/** How many agents carry each tag. */
export function tagCounts(
  agents: readonly { tags: readonly string[] }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    for (const tag of new Set(agent.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The existing tags to offer for what is typed: those containing it (all,
 * when nothing is typed), without the ones already picked, the most used
 * first, then alphabetically.
 */
export function suggestTags(
  counts: ReadonlyMap<string, number>,
  typed: string,
  picked: readonly string[],
): string[] {
  const needle = normalizeTag(typed);
  return [...counts.keys()]
    .filter(tag => !picked.includes(tag) && tag.includes(needle))
    .sort(
      (a, b) =>
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
    );
}

/** The Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** The shorter of two tags must be this long to count as the other's prefix. */
const MIN_PREFIX_LENGTH = 3;
/** Both tags must be this long before a small edit distance counts. */
const MIN_FUZZY_LENGTH = 4;
const MAX_FUZZY_DISTANCE = 2;

function singular(tag: string): string {
  if (tag.endsWith('ies') && tag.length > 3) {
    return `${tag.slice(0, -3)}y`;
  }
  if (tag.endsWith('es') && /(s|x|z|ch|sh)es$/.test(tag)) {
    return tag.slice(0, -2);
  }
  return tag.endsWith('s') && !tag.endsWith('ss') ? tag.slice(0, -1) : tag;
}

/** Whether two different tags look like one meant as the other. */
export function areSimilarTags(a: string, b: string): boolean {
  if (a === b) {
    return false;
  }
  if (singular(a) === singular(b)) {
    return true;
  }
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length >= MIN_PREFIX_LENGTH && longer.startsWith(shorter)) {
    return true;
  }
  return (
    shorter.length >= MIN_FUZZY_LENGTH &&
    editDistance(a, b) <= MAX_FUZZY_DISTANCE
  );
}

/**
 * The existing tag a new one is probably meant as: for a tag no agent has
 * yet, the closest similar existing tag (fewest edits, then the most used).
 * Undefined when the tag exists or nothing is close.
 */
export function similarExistingTag(
  tag: string,
  counts: ReadonlyMap<string, number>,
  exclude: readonly string[] = [],
): string | undefined {
  if (counts.has(tag)) {
    return undefined;
  }
  return [...counts.keys()]
    .filter(existing => !exclude.includes(existing))
    .filter(existing => areSimilarTags(tag, existing))
    .sort(
      (a, b) =>
        editDistance(tag, a) - editDistance(tag, b) ||
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
        a.localeCompare(b),
    )[0];
}
