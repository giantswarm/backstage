import type { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  heading: {
    margin: 0,
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: -0.2,
  },
});

export interface WizardStepHeadingProps {
  /** The step's h2, e.g. "Connect an app". */
  title: ReactNode;
  /** The intro paragraph under it, muted. */
  children?: ReactNode;
}

/**
 * The heading a wizard step opens with inside a {@link WizardFrame}: the
 * step's h2 and a muted intro — the connector wizard's pattern, shared so
 * every create flow reads the same.
 */
export function WizardStepHeading({ title, children }: WizardStepHeadingProps) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="2">
      <h2 className={classes.heading}>{title}</h2>
      {children && (
        <Text as="p" color="secondary">
          {children}
        </Text>
      )}
    </Flex>
  );
}
