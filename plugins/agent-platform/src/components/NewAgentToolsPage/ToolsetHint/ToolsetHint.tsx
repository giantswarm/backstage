import type { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import ErrorIcon from '@material-ui/icons/Error';

export interface ToolsetHintProps {
  /** A problem with the selection, rather than a quiet note on it. */
  problem?: boolean;
  children: ReactNode;
}

/**
 * The line under a toolset's effect: a quiet secondary note, or a problem
 * with the selection, marked by an error icon as well as its colour.
 */
export function ToolsetHint({ problem = false, children }: ToolsetHintProps) {
  if (!problem) {
    return (
      <Text variant="body-small" color="secondary">
        {children}
      </Text>
    );
  }
  return (
    <Flex align="start" gap="1" data-problem="">
      <span
        aria-hidden
        style={{
          display: 'flex',
          flex: 'none',
          // The icon sits on the first line of the 12px text.
          paddingTop: 1,
          fontSize: 14,
          color: 'var(--bui-fg-negative)',
        }}
      >
        <ErrorIcon fontSize="inherit" />
      </span>
      <Text variant="body-small" color="danger">
        {children}
      </Text>
    </Flex>
  );
}
