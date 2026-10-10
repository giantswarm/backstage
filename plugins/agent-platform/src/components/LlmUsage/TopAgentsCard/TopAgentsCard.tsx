import { makeStyles, Theme } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import { Text } from '@backstage/ui';
import { UsageCard } from '../UsageCard';
import { formatCount, formatPercent } from '../../../lib/formatNumbers';

const useStyles = makeStyles((theme: Theme) => ({
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  row: {
    display: 'grid',
    // Name, share bar, count. The bar gives way first on a narrow card, and
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

export type TopAgentsRow = {
  id: string;
  label: string;
  href?: string;
  /** Model calls the gateway attributed to the agent in the window. */
  calls: number;
  /** Share of the window's model calls, as a percentage. */
  sharePct: number | undefined;
};

export type TopAgentsCardProps = {
  title: string;
  /** Busiest first; the card does not sort. */
  rows: TopAgentsRow[];
  /** How many rows to show; the rest are a one-line remainder. */
  limit?: number;
  emptyMessage: string;
  note?: string;
};

/**
 * A compact which-agents-are-busy list: a name, a share bar and the model-call
 * count — the Overview's activity ranking.
 *
 * Deliberately **not** a spend ranking: money has one home, the Cost tab,
 * whose by-agent table ranks by spend (see
 * `design-context/implementation/usage-metrics-ia.md`). The bar is each row's
 * share of the window's model calls, so the bars are comparable with each
 * other.
 */
export function TopAgentsCard({
  title,
  rows,
  limit = 5,
  emptyMessage,
  note,
}: TopAgentsCardProps) {
  const classes = useStyles();

  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const restCalls = rest.reduce((acc, row) => acc + row.calls, 0);

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
                aria-label={`${row.label}: ${formatPercent(row.sharePct)} of model calls`}
              >
                <div
                  className={classes.fill}
                  style={{
                    width: `${Math.min(Math.max(row.sharePct ?? 0, 0), 100)}%`,
                  }}
                />
              </div>
              <span className={classes.amount}>
                {formatCount(row.calls)}
                <span className={classes.share}>
                  {formatPercent(row.sharePct)}
                </span>
              </span>
            </div>
          ))}
          {rest.length > 0 && (
            <Text variant="body-small" color="secondary">
              and {rest.length} more, {formatCount(restCalls)} calls between
              them.
            </Text>
          )}
        </div>
      )}
    </UsageCard>
  );
}
