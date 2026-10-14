import { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { PHONE_MEDIA } from '../../utils/breakpoints';

// Not bui's `Grid`: its columns are a fixed count per breakpoint, and its
// breakpoints (640px, 768px, …) are not the portal's phone width, so it can
// express neither the auto-fit row nor the two-across phone layout.
const useStyles = makeStyles((theme: Theme) => ({
  grid: {
    display: 'grid',
    // Four across where there is room, fewer as the row narrows.
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: theme.spacing(2),
    // Two across at phone width, not one: one tile per row put 420–520px of
    // tiles above the content they summarise.
    [PHONE_MEDIA]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: theme.spacing(1.5),
    },
  },
}));

/** The responsive row `tile` stats sit in: four across, two on a phone. */
export function StatGrid({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <div className={classes.grid}>{children}</div>;
}
