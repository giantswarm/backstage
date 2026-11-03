import { getRelativeDate } from '@giantswarm/backstage-plugin-ui-react';

/**
 * `iso` where it parses as a date, else `undefined`: what a relative
 * `DateComponent` can be given without throwing.
 */
export function validTimestamp(iso?: string): string | undefined {
  return iso && !Number.isNaN(new Date(iso).getTime()) ? iso : undefined;
}

/**
 * Human relative time against the current clock -- "9 days ago", "in 23
 * minutes" -- in the words `DateComponent`'s relative dates use everywhere
 * else in the platform (its `getRelativeDate`), as a string for the places
 * that need one (a cell title, a sentence). Returns `undefined` for
 * missing/invalid input so callers can omit the line entirely.
 */
export function formatRelativeTime(iso?: string): string | undefined {
  const valid = validTimestamp(iso);
  return valid ? getRelativeDate(valid, new Date()) : undefined;
}
