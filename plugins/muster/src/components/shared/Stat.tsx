import { ReactNode } from 'react';
import { useTheme, makeStyles, Theme } from '@material-ui/core';
import { Tone, toneColors } from './tones';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: {
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
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
  },
}));

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Colours the value; defaults to the plain foreground. */
  tone?: Tone;
}

/**
 * The mockups' `Stat`: an uppercase muted label over a large tabular-nums
 * value, optionally tone-coloured. Ported 1:1 from `components/stat.tsx`.
 */
export function Stat({ label, value, tone }: StatProps) {
  const classes = useStyles();
  const theme = useTheme();
  const color = tone ? toneColors(theme, tone).text : undefined;
  return (
    <div className={classes.root}>
      <span className={classes.label}>{label}</span>
      <span className={classes.value} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}
