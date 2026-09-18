import { Progress } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';

export interface LoadingIndicatorProps {
  /** What is being loaded — also the progress bar's accessible name. */
  label: string;
}

/**
 * Indeterminate progress bar with a muted label, for a region that is still
 * loading its contents.
 *
 * `Progress` holds the bar back for 250ms, so a fetch that resolves from cache
 * doesn't flash one.
 */
export function LoadingIndicator({ label }: LoadingIndicatorProps) {
  return (
    <Flex direction="column" gap="2">
      <Progress aria-label={label} />
      <Text color="secondary">{label}</Text>
    </Flex>
  );
}
