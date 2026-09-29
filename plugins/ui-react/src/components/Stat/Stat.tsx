import { ReactNode } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core';
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
export function Stat({ label, value, tone, hint }: StatProps) {
  const classes = useStyles();
  const theme = useTheme();
  const color = tone ? toneColors(theme, tone).text : undefined;
  return (
    <div className={classes.root}>
      <span className={classes.label}>
        {label}
        {hint && (
          <InfoHint label={`How ${label} is calculated`}>{hint}</InfoHint>
        )}
      </span>
      <span className={classes.value} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}
