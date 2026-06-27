import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from '../../lib/k8s';

const UNLABELED = '—';

const useStyles = makeStyles(theme => ({
  scroll: {
    overflowX: 'auto',
  },
  headerCell: {
    fontWeight: 600,
    whiteSpace: 'nowrap',
    backgroundColor: theme.palette.background.default,
  },
  emptyCell: {
    textAlign: 'center',
    color: theme.palette.text.disabled,
  },
  severityCell: {
    textAlign: 'center',
    fontWeight: 600,
    cursor: 'default',
  },
  ok: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.getContrastText(theme.palette.success.main),
  },
  warning: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.getContrastText(theme.palette.warning.main),
  },
  error: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.getContrastText(theme.palette.error.main),
  },
  unknown: {
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.text.primary,
  },
}));

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

type FleetHealthMatrixProps = {
  servers: MCPServer[];
};

/**
 * Fleet health matrix recovered from the muster CRD: rows are target
 * management clusters (`muster.giantswarm.io/management-cluster` label),
 * columns are server families (`spec.family.name`), and each cell colours the
 * worst MCPServer `.status.state` in that intersection. Aggregates across all
 * selected installations.
 */
export const FleetHealthMatrix = ({ servers }: FleetHealthMatrixProps) => {
  const classes = useStyles();
  const severityClass: Record<MCPServerSeverity, string> = {
    ok: classes.ok,
    warning: classes.warning,
    error: classes.error,
    unknown: classes.unknown,
  };

  if (servers.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No MCP servers found in the selected installations.
      </Typography>
    );
  }

  const managementClusters = uniqueSorted(
    servers.map(s => s.getManagementCluster() ?? UNLABELED),
  );
  const families = uniqueSorted(servers.map(s => s.getFamily() ?? UNLABELED));

  return (
    <Box className={classes.scroll}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell className={classes.headerCell}>
              Management cluster
            </TableCell>
            {families.map(family => (
              <TableCell
                key={family}
                align="center"
                className={classes.headerCell}
              >
                {family}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {managementClusters.map(mc => (
            <TableRow key={mc}>
              <TableCell
                component="th"
                scope="row"
                className={classes.headerCell}
              >
                {mc}
              </TableCell>
              {families.map(family => {
                const cellServers = servers.filter(
                  s =>
                    (s.getManagementCluster() ?? UNLABELED) === mc &&
                    (s.getFamily() ?? UNLABELED) === family,
                );

                if (cellServers.length === 0) {
                  return (
                    <TableCell key={family} className={classes.emptyCell}>
                      ·
                    </TableCell>
                  );
                }

                const severity = cellServers.reduce<MCPServerSeverity>(
                  (acc, server) =>
                    worstSeverity(
                      acc,
                      mcpServerStateSeverity(server.getState()),
                    ),
                  'ok',
                );

                const tooltip = (
                  <Box>
                    {cellServers.map(server => (
                      <div key={`${server.cluster}/${server.getName()}`}>
                        {server.getName()} — {server.getState() ?? 'unknown'}
                      </div>
                    ))}
                  </Box>
                );

                return (
                  <Tooltip key={family} title={tooltip} arrow>
                    <TableCell
                      className={`${classes.severityCell} ${severityClass[severity]}`}
                    >
                      {cellServers.length}
                    </TableCell>
                  </Tooltip>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};
