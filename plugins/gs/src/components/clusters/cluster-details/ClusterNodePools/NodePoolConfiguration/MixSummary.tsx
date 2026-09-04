import { Flex, Text } from '@backstage/ui';
import { type MixEntry } from '../../../../hooks';

const DEFAULT_LIMIT = 6;

interface MixSummaryProps {
  entries: MixEntry[];
  limit?: number;
}

/**
 * A distribution across running nodes, e.g. `14 spot · 2 on-demand`.
 * A single-bucket distribution drops the count, since it adds nothing.
 */
export const MixSummary = ({
  entries,
  limit = DEFAULT_LIMIT,
}: MixSummaryProps) => {
  if (entries.length === 0) {
    return null;
  }

  const shown = entries.slice(0, limit);
  const hiddenBuckets = entries.length - shown.length;

  const full = entries.map(e => `${e.count} × ${e.value}`).join(', ');
  const summary = shown
    .map(entry =>
      entries.length === 1 ? entry.value : `${entry.count} ${entry.value}`,
    )
    .join(' · ');

  return (
    <Flex gap="1" align="center" title={full}>
      <Text variant="body-medium">
        {summary}
        {hiddenBuckets > 0 ? ` · +${hiddenBuckets} more` : ''}
      </Text>
    </Flex>
  );
};
