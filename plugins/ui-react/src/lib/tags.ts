import {
  exceedsTagLimit,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  parseTags,
  TAG_PATTERN,
  TAGS_ANNOTATION,
} from '@giantswarm/backstage-plugin-gs-common';

/**
 * Tags in the portal's forms: the stored rule and its reader come from
 * gs-common, which gs-backend checks against too; this adds how typed text
 * becomes tags, the problems a form shows, and suggestions.
 */
export {
  exceedsTagLimit,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  parseTags,
  TAG_PATTERN,
  TAGS_ANNOTATION,
};

/** Why more tags cannot be added. */
export const MAX_TAGS_PROBLEM = `At most ${MAX_TAGS} tags.`;

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

/** Those of `added` that `tags` does not hold yet, once each, in order. */
function freshTags(tags: readonly string[], added: readonly string[]) {
  return [...new Set(added)].filter(tag => !tags.includes(tag));
}

/**
 * Whether `added` holds tags new to `tags` and adding them would break the
 * limit over `stored` (`exceedsTagLimit`).
 */
export function exceedsMaxTags(
  tags: readonly string[],
  added: readonly string[],
  stored: readonly string[] = [],
): boolean {
  const fresh = freshTags(tags, added);
  return fresh.length > 0 && exceedsTagLimit([...tags, ...fresh], stored);
}

/**
 * `tags` with those of `added` it does not hold yet appended, in order, as
 * long as the limit over `stored` holds (`exceedsTagLimit`).
 */
export function addTags(
  tags: readonly string[],
  added: readonly string[],
  stored: readonly string[] = [],
): string[] {
  const next = [...tags];
  for (const tag of freshTags(tags, added)) {
    if (!exceedsTagLimit([...next, tag], stored)) {
      next.push(tag);
    }
  }
  return next;
}

/**
 * A typed but not yet added text taken into `tags`: the parts that can be
 * tags added, the rest left as the draft. What every tags form does with a
 * draft when it is left (Continue, submit), as the field does on Enter. A
 * draft that would take `tags` past {@link MAX_TAGS} stays as it is.
 */
export function commitTagDraft(
  tags: readonly string[],
  draft: string,
  stored: readonly string[] = [],
): { tags: string[]; draft: string } {
  const { tags: valid, invalid } = splitDraft(draft);
  if (exceedsMaxTags(tags, valid, stored)) {
    return { tags: [...tags], draft };
  }
  return { tags: addTags(tags, valid, stored), draft: invalid.join(', ') };
}

/**
 * Why a typed but not yet added text cannot become tags: the first of its
 * comma-separated parts that cannot, else that `tags` break the limit over
 * `stored` (the resource's tags as read; see `exceedsTagLimit`: a list past
 * {@link MAX_TAGS} that holds a tag not stored), or the text would take them
 * past it. Undefined when it can, or is empty.
 */
export function draftProblem(
  text: string,
  tags: readonly string[],
  stored: readonly string[] = [],
): string | undefined {
  if (exceedsTagLimit(tags, stored)) {
    return MAX_TAGS_PROBLEM;
  }
  for (const part of splitTyped(text)) {
    const problem = tagProblem(normalizeTag(part));
    if (problem) {
      return problem;
    }
  }
  return exceedsMaxTags(tags, splitDraft(text).tags, stored)
    ? MAX_TAGS_PROBLEM
    : undefined;
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
  // Only the part being typed: earlier comma-separated parts are kept in the
  // draft when they cannot be tags.
  const needle = normalizeTag(typed.slice(typed.lastIndexOf(',') + 1));
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
/**
 * Both tags must be this long before a small edit distance counts: one edit
 * turns a four-letter tag into an unrelated word (`docs`, `dogs`).
 */
const MIN_FUZZY_LENGTH = 5;
/**
 * The edits two tags may differ by: one below {@link LONG_TAG_LENGTH}
 * characters, where two would be half of `pods` (`prod`), else two.
 */
const LONG_TAG_LENGTH = 7;

function maxFuzzyDistance(shorter: string): number {
  return shorter.length >= LONG_TAG_LENGTH ? 2 : 1;
}

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
    editDistance(a, b) <= maxFuzzyDistance(shorter)
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

/** What a form's Tags field changes in the form's state. */
export type TagsFieldUpdaters = {
  /** Adds tags not yet present (already normalized and valid). */
  addTags: (tags: readonly string[]) => void;
  removeTag: (tag: string) => void;
  setTagDraft: (draft: string) => void;
  /** Adds what the draft can, leaving the rest typed ({@link commitTagDraft}). */
  commitTagDraft: () => void;
};

/**
 * The Tags field's updaters over a form state that holds `tags` and
 * `tagDraft`, for a form provider's context; `stored` are an edited
 * resource's tags as read (`exceedsTagLimit`). Stable for a stable
 * `setState` and `stored`.
 */
export function tagsFieldUpdaters<
  S extends { tags: string[]; tagDraft?: string },
>(
  setState: (update: (prev: S) => S) => void,
  stored: readonly string[] = [],
): TagsFieldUpdaters {
  return {
    addTags: added =>
      setState(prev => {
        const next = addTags(prev.tags, added, stored);
        return next.length > prev.tags.length ? { ...prev, tags: next } : prev;
      }),
    removeTag: tag =>
      setState(prev => ({
        ...prev,
        tags: prev.tags.filter(each => each !== tag),
      })),
    setTagDraft: tagDraft => setState(prev => ({ ...prev, tagDraft })),
    commitTagDraft: () =>
      setState(prev => {
        if (!prev.tagDraft?.trim()) {
          return prev;
        }
        const committed = commitTagDraft(prev.tags, prev.tagDraft, stored);
        return { ...prev, tags: committed.tags, tagDraft: committed.draft };
      }),
  };
}
