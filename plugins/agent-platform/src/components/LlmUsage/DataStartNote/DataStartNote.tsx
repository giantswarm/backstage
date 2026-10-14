import { Text } from '@backstage/ui';
import type { LlmUsage } from '../../../lib/llmUsage';
import { formatDayWithYear } from '../../../lib/formatDay';

export type DataStartNoteProps = {
  usage: LlmUsage;
};

/**
 * Says where the gateway's records start when they start after the selected
 * window does — on an installation whose metrics began 40 days ago, 90 days
 * shows the same totals as 40, and nothing else on the page says why.
 *
 * Nothing when the data covers the whole window. Read from the data
 * (`usage.dataStart`), never configured: every installation's metrics start
 * on a different day. The muster section on Connectors says the same for its
 * own metrics.
 *
 * Worded as what was recorded, not as when the data "starts": Prometheus
 * cannot tell a gateway that was not exporting yet from one that restarted
 * and then saw no calls for a while. Both read as no calls recorded, which is
 * true either way.
 *
 * Names the gateway, because the Overview also carries the reader's session
 * count, which is kagent's and has its own window.
 */
export function DataStartNote({ usage }: DataStartNoteProps) {
  const { dataStart, windowDays } = usage;
  if (!dataStart) {
    return null;
  }
  return (
    <Text as="p" variant="body-small" color="secondary">
      The gateway has recorded model calls only since{' '}
      {formatDayWithYear(dataStart.day)}, so its figures cover{' '}
      {dataStart.coveredDays} of the {windowDays} days.
    </Text>
  );
}
