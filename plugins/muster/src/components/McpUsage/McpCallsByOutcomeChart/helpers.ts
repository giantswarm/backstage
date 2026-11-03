import {
  formatDayTick,
  formatDayTooltip,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Bucket labels for the tool-call chart. muster's buckets are aligned to UTC
 * (see `usageWindow` in muster-backend): daily ones start at UTC midnight,
 * hourly ones on the UTC hour. So they are labelled in UTC, like the Usage
 * charts beside them and the data-start note above them; in the browser's
 * zone, a UTC-midnight bucket west of UTC would read as the day before.
 */

/** The `YYYY-MM-DD` UTC day an ISO bucket start falls on. */
function bucketDay(start: string): string {
  return start.slice(0, 10);
}

/** Axis tick for a bucket start: hour of day for hourly, date for daily. */
export function formatBucketTick(start: string, stepHours: number): string {
  if (stepHours < 24) {
    return new Date(start).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }
  return formatDayTick(bucketDay(start));
}

/** Tooltip heading for a bucket start. */
export function formatBucketTooltip(start: string, stepHours: number): string {
  if (stepHours < 24) {
    return new Date(start).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }
  return formatDayTooltip(bucketDay(start));
}
