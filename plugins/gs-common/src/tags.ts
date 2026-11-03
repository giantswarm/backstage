/**
 * Tags: free-form keywords people find an agent, skill, connector or workflow
 * by (`util`, `marketing`). The one rule every writer checks, the portal's
 * forms and gs-backend alike, and every reader drops a value against.
 */

/** Where an agent, connector or workflow keeps its tags, comma-joined. */
export const TAGS_ANNOTATION = 'ui.giantswarm.io/tags';

/** The longest tag the charts take. */
export const MAX_TAG_LENGTH = 63;

/** The most tags one resource carries; muster and gs-backend refuse more. */
export const MAX_TAGS = 50;

/** Lowercase letters and digits, single `-` between. */
export const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Whether a value is a tag as it is stored. */
export function isValidTag(tag: string): boolean {
  return tag.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(tag);
}

/**
 * The tags in a stored value: split on commas, trimmed and lowercased,
 * without empties, repeats or values that are not a valid tag. Never cut to
 * {@link MAX_TAGS}: a reader shows what was written.
 */
export function parseTags(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(isValidTag),
    ),
  ];
}
