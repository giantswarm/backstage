import { ReactNode } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core';
import { PHONE_MEDIA } from '../../utils/breakpoints';
import { Tone, toneColors } from '../../utils/tones';
import { InfoHint } from '../InfoHint';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.7rem',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
  },
  value: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.2,
    // Tabular figures so a column of stats does not jitter as values change,
    // and so digits line up across a strip.
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  sub: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  // The tile: an outlined card, drawn directly so it needs no MUI component.
  tile: {
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    background: theme.palette.background.paper,
    gap: theme.spacing(0.5),
    minWidth: 0,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: 600,
  },
  tileValue: {
    fontSize: '1.75rem',
    fontWeight: 300,
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    overflowWrap: 'anywhere',
    // A tile is ~163px wide at 375 (two across, see `StatGrid`), so the
    // value steps down to keep "$1,234.56" on one line.
    [PHONE_MEDIA]: {
      fontSize: '1.375rem',
    },
  },
  grid: {
    display: 'grid',
    // Four across where there is room, fewer as the row narrows.
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: theme.spacing(2),
    // Two across at phone width, not one: one tile per row put 420–520px of
    // tiles above the content they summarise.
    [PHONE_MEDIA]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: theme.spacing(1.5),
    },
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
}));

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Colours the value; defaults to the plain foreground. */
  tone?: Tone;
  /**
   * How the figure is arrived at, behind an info affordance next to the label.
   *
   * For the arithmetic a reader cannot infer from the label — which window,
   * which subset of the traffic, mean or median. Not for a restatement of the
   * label, which only teaches people to ignore the icon.
   */
  hint?: string;
  /**
   * `inline` (the default) for a strip of stats inside a card or pane;
   * `tile` for a headline figure in its own outlined card, larger, laid out
   * in a {@link StatGrid}.
   */
  variant?: 'inline' | 'tile';
  /** Rendered on the value's baseline, e.g. a {@link StatDelta}. */
  beside?: ReactNode;
  /** A muted line under the value, e.g. what the figure covers. */
  sub?: ReactNode;
}

/**
 * One labelled number: an uppercase muted label over a large tabular-nums
 * value, optionally tone-coloured and optionally explained.
 *
 * The primitive a stats strip is built from. Use it for a figure a reader
 * scans rather than acts on; a value that is good or bad takes a `tone`, and
 * one that is merely a count takes none.
 *
 * A `hint` renders as an {@link InfoHint} next to the label.
 */
export function Stat({
  label,
  value,
  tone,
  hint,
  variant = 'inline',
  beside,
  sub,
}: StatProps) {
  const classes = useStyles();
  const theme = useTheme();
  const color = tone ? toneColors(theme, tone).text : undefined;
  const tile = variant === 'tile';
  const valueNode = (
    <span
      className={tile ? `${classes.value} ${classes.tileValue}` : classes.value}
      style={color ? { color } : undefined}
    >
      {value}
    </span>
  );
  return (
    <div className={tile ? `${classes.root} ${classes.tile}` : classes.root}>
      <span
        className={
          tile ? `${classes.label} ${classes.tileLabel}` : classes.label
        }
      >
        {label}
        {hint && (
          <InfoHint label={`How ${label} is calculated`}>{hint}</InfoHint>
        )}
      </span>
      {beside ? (
        <span className={classes.valueRow}>
          {valueNode}
          {beside}
        </span>
      ) : (
        valueNode
      )}
      {sub && <span className={classes.sub}>{sub}</span>}
    </div>
  );
}

/** The responsive row `tile` stats sit in: four across, two on a phone. */
export function StatGrid({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <div className={classes.grid}>{children}</div>;
}

/** Muted text on a stat's value baseline (`beside`), e.g. a change against the last window. */
export function StatDelta({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return <span className={classes.delta}>{children}</span>;
}
