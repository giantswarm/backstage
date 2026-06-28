import { Box, Paper, Typography, makeStyles, Theme } from '@material-ui/core';
import { MCPServer } from '../../lib/k8s';
import { InstallationHealthPill } from '../shared';
import { partitionServers, presenceByMc } from '../../lib/serverGrouping';

const useStyles = makeStyles((theme: Theme) => ({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  groupLabel: {
    marginTop: theme.spacing(1),
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.palette.text.secondary,
    '&:first-child': {
      marginTop: 0,
    },
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1, 1.5),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.shape.borderRadius,
  },
  name: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
  },
  kindLabel: {
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
  pills: {
    marginLeft: 'auto',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  count: {
    marginLeft: theme.spacing(0.5),
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  },
}));

type HealthRowProps = {
  name: string;
  kind: string;
  servers: MCPServer[];
};

/**
 * One health row: a server (family or integration) and a health pill per
 * management cluster it is federated across, mirroring the MCP-servers
 * manager's summary rows.
 */
function HealthRow({ name, kind, servers }: HealthRowProps) {
  const classes = useStyles();
  const presence = presenceByMc(servers);
  return (
    <Paper variant="outlined" className={classes.row}>
      <code className={classes.name}>{name}</code>
      <span className={classes.kindLabel}>{kind}</span>
      <Box className={classes.pills}>
        {presence.map(p => (
          <InstallationHealthPill
            key={p.mc}
            name={p.mc}
            severity={p.severity}
            state={p.state}
          />
        ))}
        <span className={classes.count}>
          {servers.length} {servers.length === 1 ? 'instance' : 'instances'}
        </span>
      </Box>
    </Paper>
  );
}

type FleetHealthMatrixProps = {
  servers: MCPServer[];
};

/**
 * Fleet health summary recovered from the muster CRDs, realigned to mirror the
 * MCP-servers manager: standard server families and singular integration
 * servers each get a row carrying a health pill per management cluster they are
 * federated across (worst `.status.state` in that family × cluster cell). Reads
 * from `.status.state` alone, so it needs no muster session, and is scoped to
 * the single active installation. `Auth Required` is treated as healthy, not
 * degraded (see `mcpServerStateSeverity`).
 */
export const FleetHealthMatrix = ({ servers }: FleetHealthMatrixProps) => {
  const classes = useStyles();

  if (servers.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No MCP servers found in this installation.
      </Typography>
    );
  }

  const { standard, integration } = partitionServers(servers);

  return (
    <Box className={classes.stack}>
      {standard.length > 0 && (
        <Typography variant="caption" className={classes.groupLabel}>
          Standard servers
        </Typography>
      )}
      {standard.map(group => (
        <HealthRow
          key={group.family}
          name={group.family}
          kind="standard server"
          servers={group.servers}
        />
      ))}

      {integration.length > 0 && (
        <Typography variant="caption" className={classes.groupLabel}>
          Integration servers
        </Typography>
      )}
      {integration.map(server => (
        <HealthRow
          key={`${server.cluster}/${server.getName()}`}
          name={server.getName()}
          kind="integration server"
          servers={[server]}
        />
      ))}
    </Box>
  );
};
