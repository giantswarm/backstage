/**
 * Plan-to-epic mapping (the epic side lives in the roadmap plugin).
 *
 * By team convention every plan PRD starts from a GitHub epic issue and
 * carries an `**Epic:** [owner/repo#N](https://github.com/...)` header line.
 * This helper extracts that link so the plan view can surface the epic as a
 * chip into the roadmap board.
 */

const EPIC_HEADER_PATTERN =
  /\*\*Epic:?\*\*:?\s*(?:\[([^\]]*)\]\()?(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)\)?/i;

export interface EpicLink {
  /** Link text as written, e.g. `giantswarm/giantswarm#36625`. */
  label: string;
  /** The epic issue URL. */
  url: string;
}

export function findEpicLink(markdown: string): EpicLink | undefined {
  const match = markdown.match(EPIC_HEADER_PATTERN);
  if (!match) {
    return undefined;
  }
  const url = match[2];
  const label =
    match[1] || url.replace('https://github.com/', '').replace('/issues/', '#');
  return { label, url };
}
