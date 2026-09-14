import { makeStyles, Theme } from '@material-ui/core';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';
import type { LlmUsage } from '../../../lib/llmUsage';
import {
  formatCount,
  formatPercent,
  formatTokens,
  formatUsd,
} from '../../../lib/formatNumbers';

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
 * The window's headline figures.
 *
 * **No tone on any of them.** None of these is good or bad on its own: a token
 * count is a count, and whether $40 a month is fine is not something this page
 * can know. The same convention `Stat` and the sessions strip keep.
 *
 * The cost is **measured, not estimated**: the gateway prices every call from
 * its model catalogue as the call happens, and this is the sum. Only the
 * session figures are estimates, because those multiply kagent's token counts
 * by a rate — which is why "Est. cost" appears on the sessions surfaces and
 * plain "Cost" here.
 *
 * It still is not an invoice, and a model the catalogue cannot price
 * contributes nothing rather than an error — so it reads `—` rather than
 * `$0.00` when nothing could be priced. Read it next to the unpriced-models
 * warning, which is the only thing distinguishing the two.
 */
export function CostTotalsStrip({ usage }: { usage: LlmUsage }) {
  const classes = useStyles();
  const { totals } = usage;

  return (
    <div className={classes.strip}>
      <Stat label="Cost" value={formatUsd(totals.costUsd)} />
      <Stat label="Tokens" value={formatTokens(totals.tokens)} />
      <Stat label="Model calls" value={formatCount(totals.calls)} />
      <Stat label="Agents active" value={formatCount(totals.agents)} />
      <Stat label="Models used" value={formatCount(totals.models)} />
      <Stat
        label="Blended $/1M tokens"
        value={formatUsd(totals.usdPerMillion)}
      />
      {/* Untoned: a low cache-read share is worth knowing but is not a fault —
          plenty of workloads have nothing cacheable. `—` when there is no
          input traffic to measure it against, which is not the same as 0%. */}
      <Stat
        label="Cache read share"
        value={formatPercent(totals.cacheReadSharePct)}
      />
    </div>
  );
}
