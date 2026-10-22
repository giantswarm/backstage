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
 * The cost is the gateway's own price for the person's model calls when the
 * backend can read it (`actualCostUsd`): every call made as them, sessions or
 * not, so it can exceed what the tokens beside it would cost — its `sub` and
 * hint say so. Where it cannot, the stat falls back to an estimate, labelled
 * "Est.": the installation's observed $/token applied to the token totals
 * beside it, with the reason for the fallback leading its hint. Either reads
 * `—` rather than `$0.00` when nothing could be priced, because "nothing was
 * priced" and "nothing was spent" are different facts — and a skeleton rather
 * than either while its queries are in flight, because "not yet" is a third
 * thing again.
 *
 * **Narrowed windows**: the screen's time control can ask for fewer days than
 * the backend's fixed fan-out window. Turns, tokens, sessions and tool calls
 * re-total from the daily buckets; a backend that does not report sessions or
 * tool calls per day leaves them undefined, and those render `—` ("not
 * knowable for this window", the same meaning the em dash carries everywhere
 * else here) rather than full-window numbers under a narrower label. The
 * actual cost is read for the narrowed window itself. The reported cost has
 * no daily buckets, so with `narrowedFromDays` set its stat stays out
 * entirely.
 */
export type StripTotals = Omit<SessionUsageTotals, 'sessions' | 'toolCalls'> & {
  /** Undefined when not knowable for the window. */
  sessions?: number;
  /** Undefined when not knowable for the window. */
  toolCalls?: number;
};

export function TotalsStrip({
  totals,
  windowDays,
  narrowedFromDays,
  rates,
  isRateLoading,
  costBasis,
  actualCostUsd,
  actualCostHint,
  isActualCostLoading,
  currency = USD,
}: {
  totals: StripTotals;
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
  /**
   * How the estimate was arrived at, from `describeCostBasis` — led by why
   * there is no actual cost, when that adds anything.
   */
  costBasis?: string;
  /** The gateway's price for the person's own calls, when it could be read. */
  actualCostUsd?: number;
  /** What the actual cost covers, from `describeActualCost`. */
  actualCostHint?: string;
  /** Whether there is an actual cost is not known yet. */
  isActualCostLoading?: boolean;
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
        value={
          totals.sessions === undefined ? '—' : formatCount(totals.sessions)
        }
        hint={
          totals.sessions === undefined
            ? notNarrowable('session counts')
            : `Counts sessions with at least one turn ${windowNote}.`
        }
      />
      <Stat
        label="Turns"
        value={formatCount(totals.turns)}
        hint={`Counts messages sent to an agent ${windowNote}, once each however many calls the answer took.`}
      />
      <Stat
        label="Input tokens (billed)"
        value={formatTokens(totals.inputTokens)}
        hint="Sums every token these turns sent to a model across each call, including delegated agents'."
      />
      <Stat
        label="Output tokens"
        value={formatTokens(totals.outputTokens)}
        hint="Sums every token a model generated in these turns, including delegated agents'."
      />
      <Stat
        label="Tool calls"
        value={
          totals.toolCalls === undefined ? '—' : formatCount(totals.toolCalls)
        }
        hint={
          totals.toolCalls === undefined
            ? notNarrowable('tool-call counts')
            : 'Counts the tools called in these turns; a hand-off to another agent does not count.'
        }
      />
      {/* A skeleton, not an em dash, while either figure is in flight. The
          counts beside it come from kagent and land first, so an em dash here
          reads as "nothing could be priced" — a finding — when the truth is
          only "not yet". Sized to the value type so the strip does not reflow
          when the figure arrives. */}
      {actualCostUsd !== undefined ? (
        <Stat
          label="Cost"
          hint={actualCostHint}
          value={formatMoney(actualCostUsd, currency)}
          sub="All your model calls"
        />
      ) : (
        <Stat
          label={isActualCostLoading ? 'Cost' : 'Est. cost'}
          hint={isActualCostLoading ? undefined : costBasis}
          value={
            isActualCostLoading || isRateLoading ? (
              <Skeleton width={56} height={22} rounded />
            ) : (
              formatMoney(spend.estimatedUsd, currency)
            )
          }
        />
      )}
      {/* Beside the cost, never in place of it: a figure only some
          runtimes report (the claude Harness does, ADK does not), summed over
          the turns that reported one. Absent means not reported, so a window
          with none shows no stat rather than "$0.00". Stays in USD — it is
          what the runtime said, not a figure we price. */}
      {!narrowed && spend.reportedUsd !== undefined && (
        <Stat
          label="Reported cost"
          value={formatUsd(spend.reportedUsd)}
          hint="Sums what the agents' runtimes reported per turn. Most runtimes report none, so it usually covers fewer turns than the estimate."
        />
      )}
    </div>
  );
}
