import { ReactNode } from 'react';
import { Box, Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';

// The muted rounded icon square has no bui primitive (Box exposes no
// background/border-radius props), so keep a tiny makeStyles block for just
// that surface. Everything else is expressed with bui layout/typography props.
const useStyles = makeStyles((theme: Theme) => ({
  iconSquare: {
    flexShrink: 0,
    width: 32,
    height: 32,
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    '& svg': {
      fontSize: 18,
    },
  },
}));

export interface SectionHeaderProps {
  /** A `@material-ui/icons` glyph rendered in the muted icon square. */
  icon: ReactNode;
  title: string;
  description?: string;
  /** Optional trailing content (e.g. a button) aligned to the right. */
  action?: ReactNode;
}

/**
 * The mockups' section header: a muted rounded icon square, a semibold title,
 * and a muted description capped at ~70ch. Reused by every muster screen so the
 * section rhythm stays identical (see the fidelity-mapping table in the plan).
 */
export function SectionHeader({
  icon,
  title,
  description,
  action,
}: SectionHeaderProps) {
  const classes = useStyles();
  return (
    <Flex align="start" gap="2" mb="5">
      <span className={classes.iconSquare}>{icon}</span>
      <Flex direction="column" gap="1" style={{ minWidth: 0, flexGrow: 1 }}>
        <Text as="p" variant="body-large" weight="bold">
          {title}
        </Text>
        {description && (
          <Text
            as="p"
            variant="body-medium"
            color="secondary"
            style={{ maxWidth: '70ch' }}
          >
            {description}
          </Text>
        )}
      </Flex>
      {action && <Box style={{ flexShrink: 0 }}>{action}</Box>}
    </Flex>
  );
}
