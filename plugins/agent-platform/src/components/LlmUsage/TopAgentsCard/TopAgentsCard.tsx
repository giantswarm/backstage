import { makeStyles, Theme } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import { Text } from '@backstage/ui';
import { PHONE_MEDIA } from '@giantswarm/backstage-plugin-ui-react';
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
    // At phone width the name has the line to itself, beside the figures,
    // with the bar under both (T22 C23): in the three-column row the name got
    // ~96px and a truncation whose full text lived only in `title=`, which a
    // phone never shows.
    [PHONE_MEDIA]: {
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gridTemplateAreas: '"name amount" "track track"',
      rowGap: theme.spacing(0.5),
    },
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    [PHONE_MEDIA]: {
      gridArea: 'name',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
    },
  },
  track: {
    height: 8,
    borderRadius: 4,
    background: theme.palette.divider,
    overflow: 'hidden',
    [PHONE_MEDIA]: {
      gridArea: 'track',
    },
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
    [PHONE_MEDIA]: {
      gridArea: 'amount',
    },
  },
  // Read out, not shown: what the count is, and a pause before the share, so
  // a screen reader (and a copy) says "12 model calls, 53%", not "1253%".
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
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
                <span className={classes.srOnly}> model calls, </span>
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
