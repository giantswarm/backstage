/**
 * Longest derived title. Well under the backend's `SESSION_NAME_MAX_LENGTH`
 * (255), because the sessions list renders a title in full and in one line: a
 * 255-character one would crowd out every other column.
 */
export const DERIVED_TITLE_MAX_LENGTH = 60;

/**
 * Below this, cutting back to a word boundary throws away too much to be worth
 * it — better a title that ends mid-word than one reduced to two words.
 */
const MIN_WORD_BOUNDARY_LENGTH = Math.floor(DERIVED_TITLE_MAX_LENGTH * 0.6);

/**
 * A session title, derived from the prompt that starts it.
 *
 * We derive one because **kagent does not**: a session created without a `name`
 * comes back with no `name` field at all (verified against 0.9.9). The short
 * titles in kagent's own list are its *UI* truncating the first message to 20
 * characters, which is why titles on sessions started elsewhere look the way they
 * do and cannot be recovered. The prototype's spec has users never naming
 * sessions, so this is the only title a session gets.
 *
 * Deliberately mechanical — a prefix of the prompt, not a summary. Anything
 * cleverer would need a model call on the way to creating a session, and the
 * title is renameable afterwards.
 *
 * Newlines and runs of whitespace collapse to single spaces: the prompt may be
 * several paragraphs, and a title is one line.
 */
export function deriveSessionTitle(prompt: string): string {
  const collapsed = prompt.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= DERIVED_TITLE_MAX_LENGTH) {
    return collapsed;
  }

  const clipped = collapsed.slice(0, DERIVED_TITLE_MAX_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  const cut =
    lastSpace >= MIN_WORD_BOUNDARY_LENGTH
      ? clipped.slice(0, lastSpace)
      : clipped;

  // Trailing punctuation before an ellipsis reads as a typo ("the ingress,…").
  return `${cut.replace(/[\s,;:.!?-]+$/, '')}…`;
}
