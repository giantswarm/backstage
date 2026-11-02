import { getRelativeDate } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Human relative time against the current clock -- "9 days ago", "in 23
 * minutes" -- in the words `DateComponent`'s relative dates use everywhere
 * else in the platform (its `getRelativeDate`), as a string for the places
 * that need one (a cell title, a sentence). Returns `undefined` for
 * missing/invalid input so callers can omit the line entirely.
 */
export function formatRelativeTime(iso?: string): string | undefined {
  if (!iso || Number.isNaN(new Date(iso).getTime())) {
    return undefined;
  }
  return getRelativeDate(iso, new Date());
}

/** ISO timestamp -> locale string, or `undefined` for missing/invalid input. */
export function formatTimestamp(iso?: string): string | undefined {
  if (!iso) {
    return undefined;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
