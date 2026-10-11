import { Link, Skeleton } from '@backstage/ui';
import type { LlmUsage } from '../../../lib/llmUsage';
import {
  formatCount,
  formatMoney,
  formatTokens,
  isConvertedCurrency,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';
import { KpiTile, KpiTileGrid } from '../KpiTile';

export type UsageKpiSessions = {
  /**
   * The signed-in user's session count over the selected window, from the
   * kagent fan-out; undefined when that window's count is not knowable.
   */
  count: number | undefined;
  /** The window that count covers: the selected one, or kagent's when narrower. */
  windowDays: number | undefined;
  isLoading: boolean;
};

/** A session count, or `—` where the window's count is not knowable. */
function sessionCount(count: number | undefined): string {
  return count === undefined ? '—' : formatCount(count);
}

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
  /** The Cost tab, which the spend teaser points to. */
  costHref?: string;
};

/**
 * The Usage overview's headline tiles: spend, tokens, the reader's own
 * sessions, and the active agents — the shape of the prototype's KPI row, on
 * the figures the platform actually has.
 *
 * **Spend is a teaser here, nothing more.** Money has one home, the Cost tab
 * (see `design-context/implementation/usage-metrics-ia.md`): this tile is the
 * Overview's one spend number, without the change against the previous window
 * or any breakdown, and it points there.
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
  costHref,
}: UsageKpiTilesProps) {
  const { totals } = usage;
  const converted = isConvertedCurrency(currency);

  const windowNote = `the last ${windowDays} days`;
  const modelsNoun = totals.models === 1 ? 'model' : 'models';

  return (
    <KpiTileGrid>
      <KpiTile
        label={converted ? 'Est. spend' : 'Spend'}
        hint={
          converted
            ? `Shows what the gateway priced every model call at over ${windowNote}, converted from USD at this environment's configured rate. It is an estimate, not an invoice.`
            : `Sums the gateway's price for every model call over ${windowNote}. Models missing from its catalogue add nothing.`
        }
        value={formatMoney(totals.costUsd, currency)}
        sub={
          costHref ? (
            <>
              every user's —{' '}
              <Link href={costHref} variant="body-small">
                see Cost
              </Link>
            </>
          ) : (
            "every user's model calls"
          )
        }
      />
      <KpiTile
        label="Tokens"
        hint={`Counts all tokens the gateway proxied over ${windowNote}: input, output and both cache types.`}
        value={formatTokens(totals.tokens)}
        sub={`every user's, across ${formatCount(totals.calls)} model calls`}
      />
      {sessions && (
        <KpiTile
          label="Your sessions"
          hint="Counts your sessions with at least one turn in the window, from kagent. Other users' sessions cannot be counted here, and the gateway figures beside it are everyone's."
          value={
            sessions.isLoading ? (
              <Skeleton width={56} height={28} rounded />
            ) : (
              sessionCount(sessions.count)
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
        hint={`Counts the distinct callers the gateway attributed a model call to over ${windowNote}, including any it could not name.`}
        value={formatCount(totals.agents)}
        sub={`every user's, ${formatCount(totals.models)} ${modelsNoun} answered`}
      />
    </KpiTileGrid>
  );
}
