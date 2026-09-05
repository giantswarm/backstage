import {
  Box,
  Paper,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import { MCPServer } from '../../lib/k8s';
import {
  FamilyCoverage,
  familyCoverage,
  fleetManagementClusters,
  partitionServers,
} from '../../lib/serverGrouping';
import { toneColors } from '../shared';

const useStyles = makeStyles((theme: Theme) => ({
  lead: {
    marginBottom: theme.spacing(1.5),
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  row: {
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.shape.borderRadius,
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: theme.spacing(1, 1.5),
    marginBottom: theme.spacing(0.75),
  },
  name: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
  },
  degraded: {
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  figure: {
    marginLeft: 'auto',
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  // The coverage bar: healthy, then degraded, and the track showing through
  // for the clusters the family is not deployed on.
  track: {
    display: 'flex',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: theme.palette.action.hover,
  },
  segment: {
    height: '100%',
    flexShrink: 0,
  },
  missing: {
    display: 'block',
    marginTop: theme.spacing(0.75),
    color: theme.palette.text.secondary,
  },
}));

function CoverageRow({ coverage }: { coverage: FamilyCoverage }) {
  const classes = useStyles();
  const theme = useTheme();
  const { family, present, missing, degraded, fleetSize } = coverage;
  const healthy = present.length - degraded.length;
  const percent = (n: number) => (fleetSize === 0 ? 0 : (n / fleetSize) * 100);
  // Amber for disconnected clusters, red as soon as one has failed.
  const degradedTone = degraded.some(p => p.severity === 'error')
    ? 'error'
    : 'warning';
  const degradedColors = toneColors(theme, degradedTone);

  return (
    <Paper variant="outlined" className={classes.row}>
      <Box className={classes.head}>
        <code className={classes.name}>{family}</code>
        {degraded.length > 0 && (
          <span
            className={classes.degraded}
            style={{ color: degradedColors.text }}
          >
            {degraded.length} degraded
          </span>
        )}
        <span className={classes.figure}>
          {present.length}/{fleetSize} clusters
        </span>
      </Box>
      <Box
        className={classes.track}
        role="progressbar"
        aria-label={`${family} coverage`}
        aria-valuemin={0}
        aria-valuemax={fleetSize}
        aria-valuenow={present.length}
      >
        <span
          className={classes.segment}
          style={{
            width: `${percent(healthy)}%`,
            backgroundColor: toneColors(theme, 'ok').main,
          }}
        />
        <span
          className={classes.segment}
          style={{
            width: `${percent(degraded.length)}%`,
            backgroundColor: degradedColors.main,
          }}
        />
      </Box>
      {missing.length > 0 && (
        <Typography variant="caption" className={classes.missing}>
          Not deployed on {missing.length}{' '}
          {missing.length === 1 ? 'cluster' : 'clusters'}: {missing.join(', ')}
        </Typography>
      )}
    </Paper>
  );
}

export interface FleetCoverageProps {
  /** MCPServer CRs of the active installation. */
  servers: MCPServer[];
}

/**
 * How far each standard server family reaches across the management clusters
 * the installation federates. Measured per family against the union of every
 * family's clusters, so a family still being rolled out reads as "10/24
 * clusters" with the missing clusters named -- a different fact from a
 * family that is deployed everywhere but disconnected somewhere, which the
 * degraded count carries. Read from `.status.state` and the
 * management-cluster label alone, so it needs no muster session.
 */
export function FleetCoverage({ servers }: FleetCoverageProps) {
  const classes = useStyles();
  const { standard } = partitionServers(servers);

  if (standard.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No federated (management-cluster-labelled) servers in this installation.
      </Typography>
    );
  }

  const fleet = fleetManagementClusters(standard);
  const rows = standard.map(group => familyCoverage(group, fleet));
  const everywhere = rows.filter(row => row.missing.length === 0).length;

  return (
    <Box>
      <Typography variant="body2" className={classes.lead}>
        {fleet.length} management {fleet.length === 1 ? 'cluster' : 'clusters'}{' '}
        · {rows.length} {rows.length === 1 ? 'family' : 'families'} ·{' '}
        {everywhere}/{rows.length} deployed on every cluster
      </Typography>
      <Box className={classes.stack}>
        {rows.map(row => (
          <CoverageRow key={row.family} coverage={row} />
        ))}
      </Box>
    </Box>
  );
}
