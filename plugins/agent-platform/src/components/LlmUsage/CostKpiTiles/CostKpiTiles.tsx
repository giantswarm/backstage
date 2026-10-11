import type { LlmUsage } from '../../../lib/llmUsage';
import { spendChangePct } from '../../../lib/usageKpis';
import {
  formatMoney,
  formatPercent,
  isConvertedCurrency,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';
import { KpiDelta, KpiTile, KpiTileGrid } from '../KpiTile';

export type CostKpiTilesProps = {
  usage: LlmUsage;
  /** The installation's display currency; USD when it has none. */
  currency?: Currency;
  /** The window the figures cover, named in the labels and hints. */
  windowDays: number;
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
}: CostKpiTilesProps) {
  const { totals } = usage;
  const converted = isConvertedCurrency(currency);

  const delta = spendChangePct(totals.costUsd, totals.previousCostUsd);
  const deltaLabel =
    delta === undefined
      ? undefined
      : `${delta >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(delta))} vs previous ${windowDays} days`;

  const windowNote = `the last ${windowDays} days`;

  return (
    <KpiTileGrid>
      <KpiTile
        label={converted ? 'Spend (estimated)' : 'Spend'}
        hint={
          converted
            ? `What the gateway priced every model call at over ${windowNote}, converted from USD at this environment's configured rate — an estimate, not an invoice.`
            : `The gateway's price for every model call, summed over ${windowNote}. Models missing from its catalogue add nothing.`
        }
        value={formatMoney(totals.costUsd, currency)}
        beside={deltaLabel && <KpiDelta>{deltaLabel}</KpiDelta>}
        sub="Every user's model calls, as the gateway priced them."
      />
      <KpiTile
        label={converted ? 'Blended cost/1M tokens' : 'Blended $/1M tokens'}
        hint="Spend per million tokens. A blend, not a list price: cache reads count as tokens, so heavy caching pushes it below a model's headline rate."
        value={formatMoney(totals.usdPerMillion, currency)}
        sub="across every model"
      />
      {/* Untoned: a low cache-read share is worth knowing but is not a fault —
          plenty of workloads have nothing cacheable. `—` when there is no
          input traffic to measure it against, which is not the same as 0%. */}
      <KpiTile
        label="Cache read share"
        hint="Cache reads as a share of all input tokens (plain, cache reads and writes). High means prompt caching pays off."
        value={formatPercent(totals.cacheReadSharePct)}
        sub="of input tokens, read from cache"
      />
    </KpiTileGrid>
  );
}
