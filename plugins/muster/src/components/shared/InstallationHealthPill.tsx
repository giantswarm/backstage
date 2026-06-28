import { makeStyles, Theme, useTheme } from '@material-ui/core';
import { MCPServerSeverity } from '../../lib/k8s';
import { severityTone, toneColors } from './tones';

const useStyles = makeStyles((theme: Theme) => ({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.25, 0.75),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  pillName: {
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
}));

export interface InstallationHealthPillProps {
  /** Management cluster (or other scope) name shown in the pill. */
  name: string;
  severity: MCPServerSeverity;
  /** Human-readable state, shown as a suffix only when not healthy. */
  state: string;
}

/**
 * A compact health pill: a coloured dot for the severity plus the scope name,
 * with the state text appended only when the cell is not healthy. Shared by the
 * MCP-servers manager (per-MC pills on a family row) and the dashboard
 * fleet-health summary.
 */
export function InstallationHealthPill({
  name,
  severity,
  state,
}: InstallationHealthPillProps) {
  const classes = useStyles();
  const theme = useTheme();
  const color = toneColors(theme, severityTone(severity)).main;
  return (
    <span className={classes.pill} title={`${name}: ${state}`}>
      <span className={classes.pillDot} style={{ backgroundColor: color }} />
      <span className={classes.pillName}>{name}</span>
      {severity !== 'ok' && (
        <span style={{ color: toneColors(theme, severityTone(severity)).text }}>
          {state}
        </span>
      )}
    </span>
  );
}
