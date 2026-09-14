import { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';

const BAR_HEIGHT = 4;

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
  },
  value: {
    // Tabular figures so a column of numbers does not jitter and digits line
    // up down the column — the same reason `Stat` uses them.
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.2,
  },
  /**
   * The extent, i.e. the column's maximum.
   *
   * Recessive like a gridline, and it is what makes a short bar read as *short*
   * rather than as a rendering glitch. One step off the surface, hairline in
   * effect; without it the smallest value in a column looks broken.
   */
  track: {
    // Explicit, not inherited from the flex container's `stretch`: an
    // alignment change on the root must never be able to collapse the mark.
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    // Square at the baseline, rounded at the data end — every bar grows from
    // the left, so the right end is always the data end. No border: a stroke
    // round a mark is ink that is not data.
    borderRadius: `0 ${BAR_HEIGHT / 2}px ${BAR_HEIGHT / 2}px 0`,
    transition: theme.transitions.create('width', { duration: 200 }),
  },
}));

export interface DataBarProps {
  /** The formatted figure, rendered above the bar. */
  label: ReactNode;
  /**
   * The raw value the bar length encodes. `undefined` draws the track alone —
   * there is a column here but nothing to compare.
   */
  value: number | undefined;
  /** The column's maximum. A non-positive max draws no fill at all. */
  max: number;
  /** The measure's colour. One hue per column, never per row. */
  color: string;
}

/**
 * A number with a proportional bar beneath it, for a table column whose rows
 * are worth comparing at a glance.
 *
 * **The number is always the value; the bar is only a comparison aid.** So the
 * bar is `aria-hidden` and carries no label of its own — identity and
 * magnitude both rest on the text, which is also what satisfies the
 * data-viz relief rule for hues that sit below 3:1 against the surface.
 *
 * Scaled to the column's own maximum, so the longest bar in a column is full
 * width and every other is read against it. That makes bars comparable *down*
 * a column and meaningless *across* columns — which is why each column takes
 * its own hue rather than sharing one: a shared colour would invite exactly
 * the cross-column comparison the scaling does not support.
 *
 * A value of zero draws no fill, not a sliver: zero and "very small" have to
 * look different.
 *
 * Always grows from the left, and a numeric column carrying one should be
 * left-aligned to match — a right-aligned variant existed briefly and read as
 * inconsistent beside the left-aligned tables it sat next to.
 */
export function DataBar({ label, value, max, color }: DataBarProps) {
  const classes = useStyles();

  const ratio =
    value === undefined || !Number.isFinite(value) || max <= 0
      ? 0
      : Math.max(0, Math.min(value / max, 1));

  return (
    <div className={classes.root}>
      <span className={classes.value}>{label}</span>
      <div className={classes.track} aria-hidden>
        <div
          className={classes.fill}
          style={{
            width: `${ratio * 100}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
