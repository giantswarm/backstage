import type { LlmUsage } from '../../../lib/llmUsage';
import {
  Stat,
  StatDelta,
  StatGrid,
} from '@giantswarm/backstage-plugin-ui-react';
import { spendChangePct } from '../../../lib/usageKpis';
import {
  lastDaysNoun,
  previousUsageMonth,
  usageMonthLabel,
  type UsageWindow,
  usageWindowNoun,
} from '../../../lib/usageWindow';
import {
  formatMoney,
  formatPercent,
  isConvertedCurrency,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';

export type CostKpiTilesProps = {
  usage: LlmUsage;
  /** The installation's display currency; USD when it has none. */
  currency?: Currency;
  /** The window the figures cover, named in the labels and hints. */
  windowDays: number;
  /** The window as the screen selected it, when it is a month; the days otherwise. */
  window?: UsageWindow;
};

/**
 * The Cost tab's headline row: the window's spend against the previous one,
 * the blended rate it works out to, and the cache-read share that pulls that
 * rate below a model's list price.
 *
 * The Cost tab is the one home for money (see
 * `design-context/implementation/usage-metrics-ia.md`): the Overview carries
 * the spend total only as a teaser, without the delta, and the activity
 * figures (tokens, calls, agents, models) live there rather than here.
 *
 * **No tone on any of them.** Whether $40 a month is fine, or whether spend
 * rising is bad, is not something this page can know.
 *
 * The spend is **measured, not estimated**: the gateway prices every call from
 * its model catalogue as the call happens. Shown in another currency it is a
 * conversion at a configured rate — an estimate — and the tile says so (O3).
 * It still is not an invoice, and a model the catalogue cannot price
 * contributes nothing — so it reads `—` rather than `$0.00` when nothing could
 * be priced. Read it next to the unpriced-models warning.
 */
export function CostKpiTiles({
  usage,
  currency = USD,
  windowDays,
  window,
}: CostKpiTilesProps) {
  const { totals } = usage;
  const converted = isConvertedCurrency(currency);

  // The window before this one: the same days before a days window, the
  // month before a month.
  const previous =
    window?.kind === 'month'
      ? usageMonthLabel(previousUsageMonth(window.month))
      : `previous ${windowDays} days`;
  const delta = spendChangePct(totals.costUsd, totals.previousCostUsd);
  const deltaLabel =
    delta === undefined
      ? undefined
      : `${delta >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(delta))} vs ${previous}`;

  const windowNote = window
    ? usageWindowNoun(window)
    : lastDaysNoun(windowDays);
  // Said in the hint because the change is hidden, not zero, when the data
  // does not reach back to the previous window (`dataBeforePreviousWindow`),
  // and never shown for a month still being written.
  const deltaNote = `The change against ${previous} shows only when the data covers all of it, and not for a month still being written.`;

  return (
    <StatGrid>
      <Stat
        variant="tile"
        label={converted ? 'Est. spend' : 'Spend'}
        hint={
          converted
            ? `Shows what the gateway priced every model call at over ${windowNote}, converted from USD at this environment's configured rate. It is an estimate, not an invoice. ${deltaNote}`
            : `Sums the gateway's price for every model call over ${windowNote}. Models missing from its catalogue add nothing. ${deltaNote}`
        }
        value={formatMoney(totals.costUsd, currency)}
        beside={deltaLabel && <StatDelta>{deltaLabel}</StatDelta>}
        sub="Every user's model calls, as the gateway priced them."
      />
      <Stat
        variant="tile"
        label={converted ? 'Blended cost/1M tokens' : 'Blended $/1M tokens'}
        hint="Shows spend per million tokens. It is a blend, not a list price: cache reads count as tokens, so heavy caching pushes it below a model's headline rate."
        value={formatMoney(totals.usdPerMillion, currency)}
        sub="across every model"
      />
      {/* Untoned: a low cache-read share is worth knowing but is not a fault —
          plenty of workloads have nothing cacheable. `—` when there is no
          input traffic to measure it against, which is not the same as 0%. */}
      <Stat
        variant="tile"
        label="Cache read share"
        hint="Shows cache reads as a share of all input tokens, each counted once (fresh input, cache reads and cache writes). A high share means prompt caching pays off."
        value={formatPercent(totals.cacheReadSharePct)}
        sub="of input tokens, read from cache"
      />
    </StatGrid>
  );
}
