import { makeStyles, Theme } from '@material-ui/core';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';

import { GREEN_GROUP, GROUP_MEANING, type BotPrRow } from '../../lib/marge';
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
      <Stat
        label="Open"
        value={stats.total}
        hint="The open bot PRs the filters leave in view. The figures beside it count five of their classes; the classification legend lists the rest."
      />
      <Stat
        label="Green"
        value={stats.green}
        tone="ok"
        hint={GROUP_MEANING[GREEN_GROUP]}
      />
      <Stat
        label="Waiting"
        value={stats.waiting}
        tone="info"
        hint={GROUP_MEANING.waiting}
      />
      <Stat
        label="Action required"
        value={stats.actionRequired}
        tone={stats.actionRequired > 0 ? 'warning' : undefined}
        hint={GROUP_MEANING.action_required}
      />
      <Stat
        label="Security failures"
        value={stats.securityFailures}
        tone={stats.securityFailures > 0 ? 'error' : undefined}
        hint={GROUP_MEANING.security_failures}
      />
      <Stat
        label="Unclassified"
        value={stats.unclassified}
        hint={GROUP_MEANING.unclassified}
      />
    </div>
  );
}
