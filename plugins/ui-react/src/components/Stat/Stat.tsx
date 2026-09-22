import { ReactNode } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import { ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import { Tone, toneColors } from '../../utils/tones';

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
  /**
   * Shrunk to the label's own height, so a hinted stat lines up with an
   * unhinted one in the same strip — a default `ButtonIcon` is taller than the
   * 0.7rem label and pushes the value down a few pixels.
   */
  hint: {
    width: 16,
    height: 16,
    minWidth: 16,
    padding: 0,
    color: 'inherit',
  },
  hintIcon: {
    fontSize: 13,
  },
  /** Long enough for a sentence of arithmetic, narrow enough to stay readable. */
  hintText: {
    maxWidth: 280,
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
 * A `hint` renders as a focusable info button rather than a `title` on the
 * label, for two reasons: bui's `TooltipTrigger` wraps react-aria's, which
 * only wires up its own focusable components — a bare `<span>` gets nothing —
 * and a hint reachable only by hovering inert text is invisible to the
 * keyboard and to anyone who does not think to hover a number.
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
          <TooltipTrigger delay={200}>
            <ButtonIcon
              className={classes.hint}
              variant="tertiary"
              size="small"
              // The accessible name says what pressing it reveals: beside a
              // label that is already on screen, "Info" says nothing.
              aria-label={`How ${label} is calculated`}
              icon={<InfoOutlinedIcon className={classes.hintIcon} />}
            />
            <Tooltip className={classes.hintText}>{hint}</Tooltip>
          </TooltipTrigger>
        )}
      </span>
      <span className={classes.value} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}
