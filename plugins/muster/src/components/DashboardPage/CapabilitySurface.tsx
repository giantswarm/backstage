import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import type { McpServerRuntime } from '../../apis/types';
import { MCPServer } from '../../lib/k8s';
import { partitionServers } from '../../lib/serverGrouping';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  name: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  kind: {
    marginLeft: theme.spacing(1),
    fontSize: 11,
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  numeric: {
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  note: {
    display: 'block',
    padding: theme.spacing(1.5, 2),
    color: theme.palette.text.secondary,
  },
}));

export type CapabilityRow = {
  key: string;
  name: string;
  kind: 'standard server' | 'integration server' | 'core';
  /** Instances behind the row: a family's clusters, 1 for a singular server. */
  instances: number;
  tools?: number;
  resources?: number;
  prompts?: number;
};

function maxDefined(values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => typeof v === 'number');
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

function sumDefined(values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => typeof v === 'number');
  return defined.length > 0
    ? defined.reduce((total, v) => total + v, 0)
    : undefined;
}

/**
 * The per-server-group capability counts: the CRD partition says which groups
 * exist, muster's runtime list (`core_mcpserver_list`) says what each
 * contributes to this session, and muster core is appended as a row of its
 * own.
 *
 * A family's tools are counted once: muster deduplicates them across the
 * family's instances under `x_<family>_*`, so one instance's count is the
 * family's contribution -- the maximum, so an instance that is down and
 * reports none does not hide the family's tools. Resources and prompts are per
 * instance (muster#1096, muster#1100) and add up. `undefined` means the
 * runtime reports nothing for the group: the server exposes none, or is not
 * connected for this session.
 */
export function capabilityRows(
  servers: MCPServer[],
  runtime: McpServerRuntime[],
  coreTools?: number,
): CapabilityRow[] {
  const byName = new Map(runtime.map(entry => [entry.name, entry]));
  const { standard, integration } = partitionServers(servers);
  const rows: CapabilityRow[] = [];

  for (const group of standard) {
    const instances = group.servers
      .map(server => byName.get(server.getName()))
      .filter((entry): entry is McpServerRuntime => Boolean(entry));
    rows.push({
      key: `family:${group.family}`,
      name: group.family,
      kind: 'standard server',
      instances: group.servers.length,
      tools: maxDefined(instances.map(entry => entry.toolsCount)),
      resources: sumDefined(instances.map(entry => entry.resourcesCount)),
      prompts: sumDefined(instances.map(entry => entry.promptsCount)),
    });
  }

  for (const server of integration) {
    const entry = byName.get(server.getName());
    rows.push({
      key: `server:${server.getName()}`,
      name: server.getName(),
      kind: 'integration server',
      instances: 1,
      tools: entry?.toolsCount,
      resources: entry?.resourcesCount,
      prompts: entry?.promptsCount,
    });
  }

  rows.push({
    key: 'core',
    name: 'muster',
    kind: 'core',
    instances: 1,
    tools: coreTools,
  });

  return rows;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString();
}

export interface CapabilitySurfaceProps {
  /** MCPServer CRs of the active installation. */
  servers: MCPServer[];
  installation: string;
}

/**
 * What agents can reach through this muster, per server group: the tools,
 * resources and prompts each contributes to the aggregated catalogue for the
 * current session, plus muster's own core tools. Reads the same runtime list
 * the MCP servers page uses for its live state (react-query dedupes the two)
 * and `list_core_tools`; the caller gates it behind an authenticated session.
 */
export function CapabilitySurface({
  servers,
  installation,
}: CapabilitySurfaceProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);

  const runtime = useQuery({
    queryKey: ['muster', 'servers', installation],
    queryFn: () => musterApi.listServers(installation),
  });
  const core = useQuery({
    queryKey: ['muster', 'core-tools', installation],
    queryFn: () => musterApi.listCoreTools(installation),
  });

  if (runtime.isLoading || core.isLoading) {
    return <Progress />;
  }
  if (runtime.error) {
    return (
      <Typography variant="body2" color="textSecondary">
        Capability counts unavailable: {(runtime.error as Error).message}
      </Typography>
    );
  }

  const rows = capabilityRows(
    servers,
    runtime.data?.mcpServers ?? [],
    core.error ? undefined : core.data?.total,
  );

  return (
    <Paper variant="outlined" className={classes.card}>
      <Table size="small" aria-label="Capability surface">
        <TableHead>
          <TableRow>
            <TableCell>Server</TableCell>
            <TableCell align="right">Tools</TableCell>
            <TableCell align="right">Resources</TableCell>
            <TableCell align="right">Prompts</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.key}>
              <TableCell>
                <code className={classes.name}>{row.name}</code>
                <span className={classes.kind}>
                  {row.kind}
                  {row.instances > 1 ? ` · ${row.instances} instances` : ''}
                </span>
              </TableCell>
              <TableCell align="right" className={classes.numeric}>
                {formatCount(row.tools)}
              </TableCell>
              <TableCell align="right" className={classes.numeric}>
                {formatCount(row.resources)}
              </TableCell>
              <TableCell align="right" className={classes.numeric}>
                {formatCount(row.prompts)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" className={classes.note}>
        Counted for your muster session. A family's tools are shown once —
        muster deduplicates them across its instances — while resources and
        prompts are per instance and add up. A dash means the server reports
        none, or is not connected for this session.
      </Typography>
    </Paper>
  );
}
