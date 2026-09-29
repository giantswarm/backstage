import { useEffect, useState } from 'react';
import { Progress } from '@backstage/core-components';
import { Flex, Text } from '@backstage/ui';
import { useTheme } from '@material-ui/core';

export interface LoadingIndicatorProps {
  /** What is being loaded — also the progress bar's accessible name. */
  label: string;
}

/**
 * Indeterminate progress bar with a muted label, for a region that is still
 * loading its contents.
 *
 * Both halves are held back for the same 250ms `Progress` holds the bar back
 * for, so a fetch that resolves from cache shows nothing rather than flashing a
 * bare label with no bar under it.
 */
export function LoadingIndicator({ label }: LoadingIndicatorProps) {
  const theme = useTheme();
  const delay = theme.transitions.duration.short;
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setShowLabel(true), delay);
    return () => clearTimeout(handle);
  }, [delay]);

  return (
    <Flex direction="column" gap="2">
      <Progress aria-label={label} />
      {showLabel && <Text color="secondary">{label}</Text>}
    </Flex>
  );
}
