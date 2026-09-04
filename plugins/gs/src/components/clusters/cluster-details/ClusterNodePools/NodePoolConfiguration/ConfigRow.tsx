import { type ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';

interface ConfigRowProps {
  label: string;
  children: ReactNode;
}

/**
 * A label over a value, matching `ContentRow` visually but leaving the value
 * slot a block element — `ContentRow` wraps its children in a `Text` span,
 * which cannot legally contain the badge rows used throughout this tab.
 */
export const ConfigRow = ({ label, children }: ConfigRowProps) => {
  return (
    <Flex direction="column" gap="0.5">
      <Text variant="body-medium" weight="bold">
        {label}
      </Text>
      {children}
    </Flex>
  );
};
