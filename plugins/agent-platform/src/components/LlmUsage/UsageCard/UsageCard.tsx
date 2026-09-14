import { ReactNode } from 'react';
import { makeStyles, Paper, Theme } from '@material-ui/core';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    flex: '1 1 380px',
    minWidth: 0,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  full: {
    flexBasis: '100%',
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  note: {
    marginTop: theme.spacing(1),
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
}));

export type UsageCardProps = {
  title: string;
  children: ReactNode;
  /**
   * A caveat about what the card shows, rendered under it.
   *
   * These figures all carry one — an estimate, a window that excludes today, a
   * metric only the gateway sees — and a caveat two cards away from its number
   * is a caveat nobody reads.
   */
  note?: ReactNode;
  /** Span the row instead of sharing it with a sibling card. */
  wide?: boolean;
};

/**
 * The outlined, small-caps-titled card the LLM usage views are built from.
 *
 * Visually identical to the cards `AgentUsageSection` builds inline; shared
 * here because this half of the feature adds five more of them, and five more
 * copies of the same `makeStyles` block is where they start to drift apart.
 */
export function UsageCard({ title, children, note, wide }: UsageCardProps) {
  const classes = useStyles();
  return (
    <Paper
      variant="outlined"
      className={`${classes.card}${wide ? ` ${classes.full}` : ''}`}
    >
      <div className={classes.title}>{title}</div>
      {children}
      {note && <div className={classes.note}>{note}</div>}
    </Paper>
  );
}
