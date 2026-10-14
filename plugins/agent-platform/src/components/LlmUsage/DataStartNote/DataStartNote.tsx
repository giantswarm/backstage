import { Text } from '@backstage/ui';
import type { LlmUsage } from '../../../lib/llmUsage';
import { formatUsageDay } from '../../../lib/usageWindow';

export type DataStartNoteProps = {
  usage: LlmUsage;
};

/**
 * Says where the gateway's data starts when it starts after the selected
 * window does — on an installation whose metrics began 40 days ago, 90 days
 * shows the same totals as 40, and nothing else on the page says why.
 *
 * Nothing when the data covers the whole window. Read from the data
 * (`usage.dataStart`), never configured: every installation's metrics start
 * on a different day. The muster section on Connectors says the same for its
 * own metrics.
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
      The gateway's data starts on {formatUsageDay(dataStart.day)}, so its
      figures cover {dataStart.coveredDays} of the {windowDays} days.
    </Text>
  );
}
