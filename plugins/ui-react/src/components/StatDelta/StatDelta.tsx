import { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { PHONE_MEDIA } from '../../utils/breakpoints';

const useStyles = makeStyles((theme: Theme) => ({
  delta: {
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    // Half a phone's width has no room for a long comparison on one line.
    [PHONE_MEDIA]: {
      whiteSpace: 'normal',
    },
  },
}));

/** Muted text on a stat's value baseline (its `beside`), e.g. a change against the last window. */
export function StatDelta({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.delta}>{children}</span>;
}
