import { ReactNode } from 'react';
import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import Lock from '@material-ui/icons/Lock';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px dashed ${theme.palette.divider}`,
    color: theme.palette.text.secondary,
  },
  icon: {
    fontSize: 16,
    flexShrink: 0,
  },
  action: {
    marginLeft: 'auto',
  },
}));

export interface GateProps {
  label: string;
  /** Optional trailing affordance (e.g. a Connect button). */
  action?: ReactNode;
}

/**
 * The mockups' auth gate: a dashed-border box with a lock icon, shown in place
 * of any content that requires an authenticated muster session (tools, core
 * families). Optionally carries a sign-in action on the right.
 */
export function Gate({ label, action }: GateProps) {
  const classes = useStyles();
  return (
    <Box className={classes.root}>
      <Lock className={classes.icon} />
      <Typography variant="body2" color="inherit">
        {label}
      </Typography>
      {action && <Box className={classes.action}>{action}</Box>}
    </Box>
  );
}
