import { makeStyles, Theme } from '@material-ui/core';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';
import type { LlmUsage } from '../../../lib/llmUsage';
import { WINDOW_DAYS } from '../../../lib/llmUsageQueries';
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

  // Not `window`: that shadows the DOM global for the whole component.
  const windowNote = `over the last ${WINDOW_DAYS} days`;

  return (
    <div className={classes.strip}>
      <Stat
        label="Cost"
        value={formatUsd(totals.costUsd)}
        hint={`What the gateway priced every model call at as it happened, summed ${windowNote}. A model missing from its price catalogue contributes nothing.`}
      />
      <Stat
        label="Tokens"
        value={formatTokens(totals.tokens)}
        hint={`Every token the gateway proxied ${windowNote} — input, output and both cache types added together.`}
      />
      <Stat
        label="Model calls"
        value={formatCount(totals.calls)}
        hint={`Completions the gateway served ${windowNote}, counted from the call-duration histogram. One agent turn is usually several.`}
      />
      <Stat
        label="Agents active"
        value={formatCount(totals.agents)}
        hint={`Distinct callers the gateway attributed a call to ${windowNote}, including any it could not name.`}
      />
      <Stat
        label="Models used"
        value={formatCount(totals.models)}
        hint={`Distinct models that answered a call ${windowNote} — the model that replied, which need not be the one requested.`}
      />
      <Stat
        label="Blended $/1M tokens"
        value={formatUsd(totals.usdPerMillion)}
        hint="Cost divided by tokens, scaled to a million. A blend, not a list price: cache reads count as tokens, so heavy caching pushes it below a model's headline rate."
      />
      {/* Untoned: a low cache-read share is worth knowing but is not a fault —
          plenty of workloads have nothing cacheable. `—` when there is no
          input traffic to measure it against, which is not the same as 0%. */}
      <Stat
        label="Cache read share"
        value={formatPercent(totals.cacheReadSharePct)}
        hint="Cache-read tokens as a share of all input tokens (plain input, cache reads and cache writes). High is prompt caching paying off."
      />
    </div>
  );
}
