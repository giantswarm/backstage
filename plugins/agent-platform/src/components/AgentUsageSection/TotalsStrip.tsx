import { makeStyles, Theme } from '@material-ui/core';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';
import { SessionUsageTotals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { estimateCost, type TokenRates } from '../../lib/costEstimate';
import { formatCount, formatTokens, formatUsd } from '../../lib/formatNumbers';

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
 * The window's totals.
 *
 * No tone on any of them: none of these is good or bad, they are just counts.
 * And deliberately **no combined token total** — input and output are priced
 * differently, so their sum is not a number anyone acts on. Input carries
 * "(billed)" for the same reason the session detail strip does: every model
 * call re-sends the whole context, so the raw figure is startling and reads as
 * a bug unlabelled.
 *
 * The cost is the one figure here that is not counted but *derived*: the
 * installation's observed $/token applied to the token totals beside it. It
 * reads `—` rather than `$0.00` when no rate could be derived, because
 * "nothing was priced" and "nothing was spent" are different facts.
 */
export function TotalsStrip({
  totals,
  rates,
}: {
  totals: SessionUsageTotals;
  rates?: TokenRates;
}) {
  const classes = useStyles();
  return (
    <div className={classes.strip}>
      <Stat label="Sessions" value={formatCount(totals.sessions)} />
      <Stat label="Turns" value={formatCount(totals.turns)} />
      <Stat
        label="Input tokens (billed)"
        value={formatTokens(totals.inputTokens)}
      />
      <Stat label="Output tokens" value={formatTokens(totals.outputTokens)} />
      <Stat label="Tool calls" value={formatCount(totals.toolCalls)} />
      <Stat
        label="Est. cost"
        value={formatUsd(
          estimateCost(totals.inputTokens, totals.outputTokens, rates),
        )}
      />
    </div>
  );
}
