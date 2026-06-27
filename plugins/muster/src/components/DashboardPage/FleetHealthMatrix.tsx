import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from '../../lib/k8s';
import { severityTone, toneColors } from '../shared';

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
  dotCell: {
    textAlign: 'center',
    cursor: 'default',
  },
  dot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
}));

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

type FleetHealthMatrixProps = {
  servers: MCPServer[];
};

/**
 * Fleet health matrix recovered from the muster CRD: rows are the target
 * management clusters (`muster.giantswarm.io/management-cluster` label) the
 * active muster federates, columns are server families (`spec.family.name`),
 * and each cell is a coloured dot for the worst MCPServer `.status.state` in
 * that intersection -- the mockups' state-dot language. Scoped to the single
 * active installation (the picker's selection), not a cross-installation view.
 */
export const FleetHealthMatrix = ({ servers }: FleetHealthMatrixProps) => {
  const classes = useStyles();
  const theme = useTheme();

  if (servers.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No MCP servers found in this installation.
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
                const dotColor = toneColors(theme, severityTone(severity)).main;

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
                    <TableCell className={classes.dotCell}>
                      <span
                        className={classes.dot}
                        style={{ backgroundColor: dotColor }}
                      />
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
