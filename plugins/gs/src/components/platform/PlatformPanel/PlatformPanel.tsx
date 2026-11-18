import { type ReactNode, useId } from 'react';
import { makeStyles } from '@material-ui/core';
import { Card, CardBody, Flex, Text } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles({
  // Outlined, as the shell's other fold-outs and the design's panels are:
  // bui's Card alone is white on the white page.
  card: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-4)',
  },
  body: {
    padding: 'var(--bui-space-4)',
  },
});

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
  const classes = useStyles();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Card className={classes.card}>
        <CardBody className={classes.body}>
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
