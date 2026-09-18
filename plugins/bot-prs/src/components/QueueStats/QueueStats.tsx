import { makeStyles, Theme } from '@material-ui/core';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';

import type { BotPrRow } from '../../lib/marge';
import { countStats } from '../../lib/rows';

const useStyles = makeStyles((theme: Theme) => ({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2, 5),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
}));

/**
 * The counts over the listed rows, as the strip the Agent Platform pages use.
 *
 * Six figures, in the order a person reads the queue: how much is open, how
 * much the engine would merge now, and then each way a PR is held. A tone
 * only where the number is good or bad; the total is a count and takes none.
 */
export function QueueStats({ rows }: { rows: BotPrRow[] }) {
  const classes = useStyles();
  const stats = countStats(rows);
  return (
    <div className={classes.strip} data-testid="queue-stats">
      <Stat label="Open" value={stats.total} />
      <Stat label="Green" value={stats.green} tone="ok" />
      <Stat label="Waiting" value={stats.waiting} tone="info" />
      <Stat
        label="Action required"
        value={stats.actionRequired}
        tone={stats.actionRequired > 0 ? 'warning' : undefined}
      />
      <Stat
        label="Security failures"
        value={stats.securityFailures}
        tone={stats.securityFailures > 0 ? 'error' : undefined}
      />
      <Stat label="Unclassified" value={stats.unclassified} />
    </div>
  );
}
