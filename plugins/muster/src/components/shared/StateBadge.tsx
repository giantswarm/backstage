import { useTheme, makeStyles, Theme } from '@material-ui/core';
import { Tone, toneColors } from './tones';

const useStyles = makeStyles((theme: Theme) => ({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
}));

export interface StateBadgeProps {
  tone: Tone;
  label: string;
}

/**
 * Colored dot + label in an outlined pill -- the mockups' state indicator
 * (emerald = ok, amber = warning, red = error, violet = info, grey = neutral).
 * Deliberately not a bare MUI `Chip`: the dot + outline is the mockup look.
 */
export function StateBadge({ tone, label }: StateBadgeProps) {
  const classes = useStyles();
  const theme = useTheme();
  const colors = toneColors(theme, tone);
  return (
    <span className={classes.badge} style={{ color: colors.text }}>
      <span className={classes.dot} style={{ backgroundColor: colors.main }} />
      {label}
    </span>
  );
}
