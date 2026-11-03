import { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';

const useStyles = makeStyles((theme: Theme) => ({
  /**
   * The outlined card the Usage views draw their charts and tables in, as
   * agent-platform's `UsageCard` draws it: the same border, radius and inset,
   * so a connector's figures read like the gateway's beside them.
   */
  card: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  /**
   * A table scrolls inside the card if a row still does not fit, rather than
   * being clipped by it (T22 C19); the radius clips the same either way.
   */
  scrolls: {
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  title: {
    marginBottom: theme.spacing(1.5),
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: 11,
    fontWeight: 500,
    color: theme.palette.text.secondary,
  },
}));

export type McpUsageCardProps = {
  /** The small-caps title above a chart; a table names itself in its header. */
  title?: string;
  /** Scroll sideways inside the card, for a table. */
  scrolls?: boolean;
  children: ReactNode;
};

/** One chart or table of muster's usage figures, in its outlined card. */
export function McpUsageCard({ title, scrolls, children }: McpUsageCardProps) {
  const classes = useStyles();
  return (
    <div className={`${classes.card}${scrolls ? ` ${classes.scrolls}` : ''}`}>
      {title && <div className={classes.title}>{title}</div>}
      {children}
    </div>
  );
}
