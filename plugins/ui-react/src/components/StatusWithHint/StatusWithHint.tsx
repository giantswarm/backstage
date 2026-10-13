import type { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import { InfoHint } from '../InfoHint';
import { StatusDot, type StatusDotTone } from '../StatusDot';

const useStyles = makeStyles((theme: Theme) => ({
  // The state never shrinks, so in a narrow cell whatever follows it wraps
  // instead of cutting the label.
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flex: 'none',
  },
}));

export interface StatusWithHintProps {
  tone: StatusDotTone;
  /** The state in a few words, beside the dot. */
  label: string;
  /**
   * Why it is in that state, as sentences: shown in the {@link InfoHint}'s
   * tooltip (and, in the shell, its popover). Line breaks are kept. Without
   * one, no hint renders.
   */
  hint?: ReactNode;
  /** The hint's accessible name, e.g. "About the state of Sonnet 4.5". */
  hintLabel: string;
}

/**
 * A state as a list row shows it: a dot and a few words that always fit, and
 * the explanation in an {@link InfoHint} beside them rather than sentences
 * that would crowd the state out of the cell. The hint is a button that stops
 * the press, so pressing it never opens the row.
 */
export function StatusWithHint({
  tone,
  label,
  hint,
  hintLabel,
}: StatusWithHintProps) {
  const classes = useStyles();
  return (
    <span className={classes.status}>
      <StatusDot tone={tone} label={label} />
      {hint ? (
        <InfoHint label={hintLabel} size="medium">
          {hint}
        </InfoHint>
      ) : null}
    </span>
  );
}
