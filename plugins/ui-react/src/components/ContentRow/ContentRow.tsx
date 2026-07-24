import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';

export const ContentRow = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => {
  return (
    <Flex direction="column" gap="0.5">
      <Text variant="body-medium" weight="bold">
        {title}
      </Text>
      <Text variant="body-medium">{children}</Text>
    </Flex>
  );
};
