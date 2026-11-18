import { type ReactNode, useId } from 'react';
import { Card, CardBody, Flex, Text } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

export type PlatformPanelProps = {
  /** The panel's `h2`, which also names its region. */
  title: string;
  /** An 18px icon before the title. */
  icon: ReactNode;
  /** A muted sentence under the content. */
  footnote?: ReactNode;
  children: ReactNode;
};

/**
 * A section of a Platform detail page's Overview, as the design draws it: a
 * card with an icon and a small `h2`, its content under it, and an optional
 * muted footnote. The region takes its name from the heading.
 */
export function PlatformPanel({
  title,
  icon,
  footnote,
  children,
}: PlatformPanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardBody>
          <Flex direction="column" gap="3">
            <Flex align="center" gap="2">
              <span
                aria-hidden
                style={{ display: 'inline-flex', fontSize: 18, flex: 'none' }}
              >
                {icon}
              </span>
              <SectionHeader
                as="h2"
                variant="title-x-small"
                title={title}
                id={headingId}
                compact
              />
            </Flex>
            {children}
            {footnote && (
              <Text as="p" variant="body-small" color="secondary">
                {footnote}
              </Text>
            )}
          </Flex>
        </CardBody>
      </Card>
    </section>
  );
}
