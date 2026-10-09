import { makeStyles, Theme } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import { Text } from '@backstage/ui';
import { UsageCard } from '../UsageCard';
import {
  formatMoney,
  formatPercent,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';

const useStyles = makeStyles((theme: Theme) => ({
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  row: {
    display: 'grid',
    // Name, share bar, amount. The bar gives way first on a narrow card, and
    // the name truncates rather than pushing the figures out of line.
    gridTemplateColumns: 'minmax(96px, 2fr) minmax(40px, 3fr) auto',
    gap: theme.spacing(1.5),
    alignItems: 'center',
    fontSize: 13.5,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  track: {
    height: 8,
    borderRadius: 4,
    background: theme.palette.divider,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    background: theme.palette.text.primary,
  },
  amount: {
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  share: {
    marginLeft: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: 12,
  },
}));

export type TopSpendRow = {
  id: string;
  label: string;
  href?: string;
  /** USD, converted for display by the card. `undefined` renders as `—`. */
  costUsd: number | undefined;
  /** Share of the window's priced spend, as a percentage. */
  sharePct: number | undefined;
};

export type TopSpendCardProps = {
  title: string;
  rows: TopSpendRow[];
  /** How many rows to show; the rest are a one-line remainder. */
  limit?: number;
  currency?: Currency;
  emptyMessage: string;
  note?: string;
};

/**
 * A compact where-the-money-went list: a name, a share bar and the amount —
 * the Overview's at-a-glance form of the breakdowns the Cost tab carries in
 * full. The bar is each row's share of the window's priced spend, so the bars
 * are comparable with each other and with the same row on the Cost tab.
 */
export function TopSpendCard({
  title,
  rows,
  limit = 5,
  currency = USD,
  emptyMessage,
  note,
}: TopSpendCardProps) {
  const classes = useStyles();

  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const restCost = rest.reduce<number | undefined>((acc, row) => {
    if (row.costUsd === undefined) {
      return acc;
    }
    return (acc ?? 0) + row.costUsd;
  }, undefined);

  return (
    <UsageCard title={title} note={note}>
      {shown.length === 0 ? (
        <Text variant="body-medium" color="secondary">
          {emptyMessage}
        </Text>
      ) : (
        <div className={classes.rows}>
          {shown.map(row => (
            <div key={row.id} className={classes.row}>
              <span className={classes.name} title={row.label}>
                {row.href ? <Link to={row.href}>{row.label}</Link> : row.label}
              </span>
              <div
                className={classes.track}
                role="img"
                aria-label={`${row.label}: ${formatPercent(row.sharePct)} of spend`}
              >
                <div
                  className={classes.fill}
                  style={{
                    width: `${Math.min(Math.max(row.sharePct ?? 0, 0), 100)}%`,
                  }}
                />
              </div>
              <span className={classes.amount}>
                {formatMoney(row.costUsd, currency)}
                <span className={classes.share}>
                  {formatPercent(row.sharePct)}
                </span>
              </span>
            </div>
          ))}
          {rest.length > 0 && (
            <Text variant="body-small" color="secondary">
              and {rest.length} more, {formatMoney(restCost, currency)} between
              them — the Cost tab has every row.
            </Text>
          )}
        </div>
      )}
    </UsageCard>
  );
}
