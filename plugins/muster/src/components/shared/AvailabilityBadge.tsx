import { useTheme, makeStyles, Theme } from '@material-ui/core';
import Check from '@material-ui/icons/Check';
import Remove from '@material-ui/icons/Remove';
import { toneColors } from './tones';

const useStyles = makeStyles((theme: Theme) => ({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    '& svg': {
      fontSize: 12,
    },
  },
}));

export interface AvailabilityBadgeProps {
  available: boolean;
}

/**
 * Availability as muster reports it for the current caller, ported from the
 * mockups' `availability-badge.tsx`: an emerald "Available" (check) or a muted
 * "Unavailable" (minus) outlined pill. Shared by the Workflows table and the
 * workflow detail header so the two never drift. In the CRD-driven port,
 * availability maps onto `.status.valid` (a valid workflow is runnable).
 */
export function AvailabilityBadge({ available }: AvailabilityBadgeProps) {
  const classes = useStyles();
  const theme = useTheme();
  const color = available
    ? toneColors(theme, 'ok').text
    : theme.palette.text.secondary;
  return (
    <span className={classes.badge} style={{ color }}>
      {available ? <Check /> : <Remove />}
      {available ? 'Available' : 'Unavailable'}
    </span>
  );
}
