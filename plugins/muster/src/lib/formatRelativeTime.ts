import { getRelativeDate } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Human relative time against the current clock -- "9 days ago", "in 23
 * minutes" -- in the words `DateComponent`'s relative dates use everywhere
 * else in the platform (its `getRelativeDate`), as a string for the places
 * that need one (a cell title, a sentence). Returns `undefined` for
 * missing/invalid input so callers can omit the line entirely. `strict`
 * drops "about" and "less than" ("30 seconds ago"), for a table cell that
 * must hold the age in full.
 */
export function formatRelativeTime(
  iso?: string,
  { strict = false }: { strict?: boolean } = {},
): string | undefined {
  if (!iso || Number.isNaN(new Date(iso).getTime())) {
    return undefined;
  }
  return getRelativeDate(iso, new Date(), { strict });
}
