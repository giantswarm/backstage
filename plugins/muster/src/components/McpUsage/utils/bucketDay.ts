import { utcDayKey } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * The `YYYY-MM-DD` UTC day a daily usage bucket starts on, from its ISO start.
 *
 * muster-backend starts every daily bucket at UTC midnight, so this is the
 * day the bucket counts. The chart's day labels and the data-start note both
 * read it from here, so they name the same day for the same bucket. Parsed
 * rather than sliced, so a start written with an offset still gives its UTC
 * day; anything unparseable comes back unchanged.
 */
export function bucketDay(start: string): string {
  const at = Date.parse(start);
  return Number.isNaN(at) ? start : utcDayKey(at);
}
