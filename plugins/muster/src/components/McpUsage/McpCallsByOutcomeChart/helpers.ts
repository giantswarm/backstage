import {
  formatLocalTime,
  formatLocalDateFull,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  formatDayTick,
  formatDayTooltip,
} from '@giantswarm/backstage-plugin-agent-platform-common';

import { bucketDay } from '../utils/bucketDay';

/**
 * Bucket labels for the tool-call chart.
 *
 * A daily bucket is a UTC calendar day (muster-backend's `usageWindow` starts
 * it at UTC midnight), so it is labelled with that day, like the Usage charts
 * beside it and the data-start note above it; in the browser's zone, a
 * UTC-midnight bucket west of UTC would read as the day before.
 *
 * An hourly bucket starts on the UTC hour, which is also a local hour in
 * every whole-hour zone, so it keeps the browser's time like every other time
 * on the page.
 */

/** Axis tick for a bucket start: hour of day for hourly, date for daily. */
export function formatBucketTick(start: string, stepHours: number): string {
  if (stepHours < 24) {
    return formatLocalTime(start);
  }
  return formatDayTick(bucketDay(start));
}

/** Tooltip heading for a bucket start. */
export function formatBucketTooltip(start: string, stepHours: number): string {
  if (stepHours < 24) {
    return formatLocalDateFull(start);
  }
  return formatDayTooltip(bucketDay(start));
}
