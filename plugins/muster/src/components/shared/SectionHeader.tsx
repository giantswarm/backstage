import { ReactNode } from 'react';
import { Box, Typography, makeStyles, Theme } from '@material-ui/core';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2.5),
  },
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
  body: {
    minWidth: 0,
  },
  title: {
    fontWeight: 600,
    lineHeight: 1.3,
  },
  description: {
    marginTop: theme.spacing(0.5),
    maxWidth: '70ch',
    color: theme.palette.text.secondary,
  },
  action: {
    marginLeft: 'auto',
    flexShrink: 0,
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
    <Box className={classes.root}>
      <span className={classes.iconSquare}>{icon}</span>
      <Box className={classes.body}>
        <Typography variant="subtitle1" className={classes.title}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" className={classes.description}>
            {description}
          </Typography>
        )}
      </Box>
      {action && <Box className={classes.action}>{action}</Box>}
    </Box>
  );
}
