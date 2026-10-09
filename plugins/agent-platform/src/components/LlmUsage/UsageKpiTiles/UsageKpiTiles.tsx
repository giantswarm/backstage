import type { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { Skeleton } from '@backstage/ui';
import { InfoHint } from '@giantswarm/backstage-plugin-ui-react';
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

const useStyles = makeStyles((theme: Theme) => ({
  grid: {
    display: 'grid',
    // Four across where there is room, stacking all the way down to one
    // column at phone width — the 375px requirement, with no media query.
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: theme.spacing(2),
  },
  // The same outlined-card look `UsageCard` gets from its Paper, drawn
  // directly so the tile needs no MUI component.
  tile: {
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    background: theme.palette.background.paper,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    minWidth: 0,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
  },
  value: {
    fontSize: '1.75rem',
    fontWeight: 300,
    lineHeight: 1.15,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  delta: {
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  sub: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
}));

function Tile({
  label,
  hint,
  value,
  beside,
  sub,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  /** Rendered on the value's baseline, e.g. a change against last window. */
  beside?: ReactNode;
  sub?: ReactNode;
}) {
  const classes = useStyles();
  return (
    <div className={classes.tile}>
      <span className={classes.label}>
        {label}
        {hint && (
          <InfoHint label={`How ${label} is calculated`}>{hint}</InfoHint>
        )}
      </span>
      <span className={classes.valueRow}>
        <span className={classes.value}>{value}</span>
        {beside}
      </span>
      {sub && <span className={classes.sub}>{sub}</span>}
    </div>
  );
}

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
  const classes = useStyles();
  const { totals } = usage;
  const converted = isConvertedCurrency(currency);

  const delta = spendChangePct(totals.costUsd, totals.previousCostUsd);
  const deltaLabel =
    delta === undefined
      ? undefined
      : `${delta >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(delta))} vs previous ${windowDays} days`;

  const windowNote = `the last ${windowDays} days`;

  return (
    <div className={classes.grid}>
      <Tile
        label={converted ? 'Spend (estimated)' : 'Spend'}
        hint={
          converted
            ? `What the gateway priced every model call at over ${windowNote}, converted from USD at this installation's configured rate — an estimate, not an invoice.`
            : `What the gateway priced every model call at as it happened, summed over ${windowNote}. A model missing from its price catalogue contributes nothing.`
        }
        value={formatMoney(totals.costUsd, currency)}
        beside={
          deltaLabel && <span className={classes.delta}>{deltaLabel}</span>
        }
        sub="Every user's model calls, as the gateway priced them."
      />
      <Tile
        label="Tokens"
        hint={`Every token the gateway proxied over ${windowNote} — input, output and both cache types added together.`}
        value={formatTokens(totals.tokens)}
        sub={`across ${formatCount(totals.calls)} model calls`}
      />
      {sessions && (
        <Tile
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
      <Tile
        label="Active agents"
        hint={`Distinct callers the gateway attributed a model call to over ${windowNote}, including any it could not name.`}
        value={formatCount(totals.agents)}
        sub={`${formatCount(totals.models)} models answered`}
      />
    </div>
  );
}
