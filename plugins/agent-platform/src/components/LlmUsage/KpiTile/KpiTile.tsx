import type { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { InfoHint, PHONE_MEDIA } from '@giantswarm/backstage-plugin-ui-react';

/**
 * One headline tile and the grid that lays a row of them out — the shape of
 * the prototype's KPI row, shared by the gateway tiles (`UsageKpiTiles`) and
 * the kagent-derived fallback tiles (`SessionKpiTiles`) so the two rows can
 * never drift apart visually.
 */

const useStyles = makeStyles((theme: Theme) => ({
  grid: {
    display: 'grid',
    // Four across where there is room, fewer as the row narrows.
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: theme.spacing(2),
    // Two across at phone width, not one (T22 P8): one tile per row put
    // 420–520px of tiles above the content they summarise. A tile is ~163px
    // wide at 375, so the value steps down (`value` below) to keep "$1,234.56"
    // on one line.
    [PHONE_MEDIA]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: theme.spacing(1.5),
    },
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
    overflowWrap: 'anywhere',
    [PHONE_MEDIA]: {
      fontSize: '1.375rem',
    },
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
    // Half a phone's width has no room for a long comparison on one line.
    [PHONE_MEDIA]: {
      whiteSpace: 'normal',
    },
  },
  sub: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
}));

/** The responsive row the tiles sit in. */
export function KpiTileGrid({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <div className={classes.grid}>{children}</div>;
}

/** Muted text on the value's baseline, e.g. a change against last window. */
export function KpiDelta({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.delta}>{children}</span>;
}

export function KpiTile({
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
