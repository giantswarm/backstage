import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';

type SectionProps = {
  heading: string;
  children: ReactNode;
};

export const Section = ({ heading, children }: SectionProps) => {
  return (
    <Flex direction="column" gap="2">
      <Text as="h3" variant="title-small" weight="bold">
        {heading}
      </Text>

      {children}
    </Flex>
  );
};
