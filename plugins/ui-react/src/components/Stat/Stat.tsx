import { ReactNode } from 'react';
import { Card, CardBody } from '@backstage/ui';
import { makeStyles, Theme, useTheme } from '@material-ui/core';
import classNames from 'classnames';
import { PHONE_MEDIA } from '../../utils/breakpoints';
import { Tone, toneColors } from '../../utils/tones';
import { InfoHint } from '../InfoHint';

// Each variant's rules set properties the shared rules leave alone, so the
// result does not depend on the order the rules are declared in.
const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
  },
  rootInline: {
    gap: 2,
  },
  rootTile: {
    gap: theme.spacing(0.5),
  },
  // bui's Card has no border prop; without the outline a tile dissolves into
  // the page (as `EmptyStateCard`'s does).
  tile: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 'var(--bui-radius-3)',
    minWidth: 0,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
  },
  labelInline: {
    fontSize: '0.7rem',
    fontWeight: 500,
  },
  labelTile: {
    fontSize: 11,
    fontWeight: 600,
  },
  value: {
    // Tabular figures so a column of stats does not jitter as values change,
    // and so digits line up across a strip.
    fontVariantNumeric: 'tabular-nums',
  },
  valueInline: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
  },
  valueTile: {
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
   * in a `StatGrid`.
   */
  variant?: 'inline' | 'tile';
  /** Rendered on the value's baseline, e.g. a `StatDelta`. */
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
      className={classNames(
        classes.value,
        tile ? classes.valueTile : classes.valueInline,
      )}
      style={color ? { color } : undefined}
    >
      {value}
    </span>
  );
  const content = (
    <>
      <span
        className={classNames(
          classes.label,
          tile ? classes.labelTile : classes.labelInline,
        )}
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
    </>
  );

  if (tile) {
    return (
      <Card className={classes.tile}>
        <CardBody className={classNames(classes.root, classes.rootTile)}>
          {content}
        </CardBody>
      </Card>
    );
  }
  return (
    <div className={classNames(classes.root, classes.rootInline)}>
      {content}
    </div>
  );
}
