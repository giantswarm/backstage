import { makeStyles, Theme } from '@material-ui/core';
import { Skeleton } from '@backstage/ui';
import { Stat } from '@giantswarm/backstage-plugin-ui-react';
import { SessionUsageTotals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { type TokenRates } from '../../lib/costEstimate';
import { sessionSpend } from '../../lib/usageKpis';
import {
  formatCount,
  formatMoney,
  formatTokens,
  formatUsd,
  USD,
  type Currency,
} from '../../lib/formatNumbers';

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
 * "nothing was priced" and "nothing was spent" are different facts — and a
 * skeleton rather than either while the rate is still being fetched, because
 * "not yet" is a third thing again.
 *
 * **Narrowed windows**: the screen's time control can ask for fewer days than
 * the backend's fixed fan-out window. Turns and tokens re-total from the daily
 * buckets, but the backend reports sessions, tool calls and the reported cost
 * only over its full window — so with `narrowedFromDays` set those render `—`
 * ("not knowable for this window", the same meaning the em dash carries
 * everywhere else here) rather than full-window numbers under a narrower
 * label, and the reported-cost stat stays out entirely.
 */
export function TotalsStrip({
  totals,
  windowDays,
  narrowedFromDays,
  rates,
  isRateLoading,
  costBasis,
  currency = USD,
}: {
  totals: SessionUsageTotals;
  /** The window the totals cover, as the response reports it. */
  windowDays: number;
  /**
   * Set when `windowDays` is a client-side cut of the backend's own window:
   * the backend's window, for the hints on the figures that cannot be re-cut.
   */
  narrowedFromDays?: number;
  rates?: TokenRates;
  /** The rate's two Mimir queries are still in flight. */
  isRateLoading?: boolean;
  /** How the estimate was arrived at, from `describeCostBasis`. */
  costBasis?: string;
  /** The installation's display currency, for the estimate; USD when none. */
  currency?: Currency;
}) {
  const classes = useStyles();
  const windowNote = `in the last ${windowDays} days`;
  const spend = sessionSpend(totals, rates);
  const narrowed = narrowedFromDays !== undefined;
  const notNarrowable = (figure: string) =>
    `kagent reports ${figure} only over its full ${narrowedFromDays}-day window. Select ${narrowedFromDays} days to see them.`;
  return (
    <div className={classes.strip}>
      <Stat
        label="Sessions"
        value={narrowed ? '—' : formatCount(totals.sessions)}
        hint={
          narrowed
            ? notNarrowable('session counts')
            : `Sessions with at least one turn ${windowNote}.`
        }
      />
      <Stat
        label="Turns"
        value={formatCount(totals.turns)}
        hint={`Messages sent to an agent ${windowNote}, each counted once however many calls its answer took.`}
      />
      <Stat
        label="Input tokens (billed)"
        value={formatTokens(totals.inputTokens)}
        hint="Every token these turns sent to a model, summed over each call, delegated agents' included."
      />
      <Stat
        label="Output tokens"
        value={formatTokens(totals.outputTokens)}
        hint="Every token a model generated in these turns, delegated agents' included."
      />
      <Stat
        label="Tool calls"
        value={narrowed ? '—' : formatCount(totals.toolCalls)}
        hint={
          narrowed
            ? notNarrowable('tool-call counts')
            : 'Tools called in these turns; a hand-off to another agent is not one.'
        }
      />
      {/* A skeleton, not an em dash, while the rate is in flight. The counts
          beside it come from kagent and land first, so an em dash here reads
          as "nothing could be priced" — a finding — when the truth is only
          "not yet". Sized to the value type so the strip does not reflow when
          the figure arrives. */}
      <Stat
        label="Est. cost"
        hint={costBasis}
        value={
          isRateLoading ? (
            <Skeleton width={56} height={22} rounded />
          ) : (
            formatMoney(spend.estimatedUsd, currency)
          )
        }
      />
      {/* Beside the estimate, never in place of it: a figure only some
          runtimes report (the claude Harness does, ADK does not), summed over
          the turns that reported one. Absent means not reported, so a window
          with none shows no stat rather than "$0.00". Stays in USD — it is
          what the runtime said, not a figure we price. */}
      {!narrowed && spend.reportedUsd !== undefined && (
        <Stat
          label="Reported cost"
          value={formatUsd(spend.reportedUsd)}
          hint="Summed from what the agents' runtimes reported per turn. Most runtimes report none, so this usually covers fewer turns than the estimate."
        />
      )}
    </div>
  );
}
