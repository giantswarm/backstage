import { Skeleton } from '@backstage/ui';
import type { LlmUsage } from '../../../lib/llmUsage';
import { spendChangePct } from '../../../lib/usageKpis';
import {
  formatCount,
  formatMoney,
  formatPercent,
  formatTokens,
  isConvertedCurrency,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';
import { KpiDelta, KpiTile, KpiTileGrid } from '../KpiTile';

export type UsageKpiSessions = {
  /** The signed-in user's session count, from the kagent fan-out. */
  count: number | undefined;
  /** The window that count covers, as the backend reported it. */
  windowDays: number | undefined;
  isLoading: boolean;
};

export type UsageKpiTilesProps = {
  usage: LlmUsage;
  /** The installation's display currency; USD when it has none. */
  currency?: Currency;
  /** The window the gateway figures cover, for the labels. */
  windowDays: number;
  /**
   * The reader's own session count beside the platform figures, when the
   * page has one to offer. Absent on a portal without kagent.
   */
  sessions?: UsageKpiSessions;
};

/**
 * The Usage overview's headline tiles: spend, tokens, the reader's own
 * sessions, and the active agents — the shape of the prototype's KPI row, on
 * the figures the platform actually has.
 *
 * Scopes are deliberately explicit per tile rather than uniform: spend,
 * tokens and agents are **everyone's**, from the gateway; the session count
 * is **the reader's own**, because kagent lists only the caller's sessions —
 * so that tile says "Your sessions" and names its own window when it differs.
 *
 * The spend is the gateway's measured USD. Shown in another currency it is a
 * conversion at a configured rate — an estimate — and the tile says so (O3).
 */
export function UsageKpiTiles({
  usage,
  currency = USD,
  windowDays,
  sessions,
}: UsageKpiTilesProps) {
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
            ? `What the gateway priced every model call at over ${windowNote}, converted from USD at this installation's configured rate — an estimate, not an invoice.`
            : `What the gateway priced every model call at as it happened, summed over ${windowNote}. A model missing from its price catalogue contributes nothing.`
        }
        value={formatMoney(totals.costUsd, currency)}
        beside={deltaLabel && <KpiDelta>{deltaLabel}</KpiDelta>}
        sub="Every user's model calls, as the gateway priced them."
      />
      <KpiTile
        label="Tokens"
        hint={`Every token the gateway proxied over ${windowNote} — input, output and both cache types added together.`}
        value={formatTokens(totals.tokens)}
        sub={`across ${formatCount(totals.calls)} model calls`}
      />
      {sessions && (
        <KpiTile
          label="Your sessions"
          hint="Sessions you started with at least one turn in the window, from kagent's stored conversations. Other users' sessions are not countable from here — the gateway figures beside this are everyone's."
          value={
            sessions.isLoading ? (
              <Skeleton width={56} height={28} rounded />
            ) : (
              formatCount(sessions.count ?? 0)
            )
          }
          sub={
            sessions.windowDays
              ? `yours, over the last ${sessions.windowDays} days — see Your sessions`
              : 'yours — see Your sessions'
          }
        />
      )}
      <KpiTile
        label="Active agents"
        hint={`Distinct callers the gateway attributed a model call to over ${windowNote}, including any it could not name.`}
        value={formatCount(totals.agents)}
        sub={`${formatCount(totals.models)} models answered`}
      />
    </KpiTileGrid>
  );
}
