import { Text } from '@backstage/ui';
import {
  formatDayWithYear,
  usageDataStart,
} from '@giantswarm/backstage-plugin-agent-platform-common';

import type { McpUsage } from '../../../apis';
import { bucketDay } from '../utils/bucketDay';

export type McpDataStartNoteProps = {
  usage: McpUsage;
  /** The window the figures cover, as the page names it. */
  windowDays: number;
  className?: string;
};

/**
 * Where muster's records start, when that is after the window does and it
 * recorded nothing in the week before: the figures then cover fewer days than
 * the window names. Worded as what was recorded, because a restart followed
 * by a quiet spell looks the same. Daily buckets only, which is all the Usage
 * screen and a connector's page ask for; nothing otherwise.
 */
export function McpDataStartNote({
  usage,
  windowDays,
  className,
}: McpDataStartNoteProps) {
  const dataStart =
    usage.step_hours >= 24
      ? usageDataStart(
          usage.buckets.map(bucket => bucketDay(bucket.start)),
          usage.data_start ? bucketDay(usage.data_start) : undefined,
        )
      : undefined;
  if (!dataStart) {
    return null;
  }
  return (
    <Text as="p" variant="body-small" color="secondary" className={className}>
      Tool calls have been recorded only since{' '}
      {formatDayWithYear(dataStart.day)}, so these figures cover{' '}
      {dataStart.coveredDays} of the {windowDays} days.
    </Text>
  );
}
