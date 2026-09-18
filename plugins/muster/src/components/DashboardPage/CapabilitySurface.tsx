import { Paper, makeStyles, Theme } from '@material-ui/core';
import { Cell, CellText, ColumnConfig, Table, Text } from '@backstage/ui';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import type { McpServerRuntime } from '../../apis/types';
import { MCPServer, TOOL_GROUPS, ToolGroupKey } from '../../lib/k8s';
import { partitionServers } from '../../lib/serverGrouping';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  note: {
    display: 'block',
    padding: theme.spacing(1.5, 2),
  },
}));

export type CapabilityRow = {
  /** React key, and the row's identity to the table. */
  id: string;
  name: string;
  /** A family shown once, a singular server, or muster's own core tools. */
  kind: 'family' | 'server' | 'core';
  /** The tool group the row is listed under. */
  group: ToolGroupKey;
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
 * The per-server capability counts, grouped by tool group in display order:
 * the CRD partition says which rows exist and under which group, muster's
 * runtime list (`core_mcpserver_list`) says what each contributes to this
 * session, and muster core closes the Agent Platform group as a row of its
 * own -- the same order as the MCP servers page.
 *
 * A family's tools are counted once: muster deduplicates them across the
 * family's instances under `x_<family>_*`, so one instance's count is the
 * family's contribution -- the maximum, so an instance that is down and
 * reports none does not hide the family's tools. Resources and prompts are per
 * instance (muster#1096, muster#1100) and add up. `undefined` means the
 * runtime reports nothing for the row: the server exposes none, or is not
 * connected for this session.
 */
export function capabilityRows(
  servers: MCPServer[],
  runtime: McpServerRuntime[],
  coreTools?: number,
): CapabilityRow[] {
  const byName = new Map(runtime.map(entry => [entry.name, entry]));
  const rows: CapabilityRow[] = [];

  for (const { group, rows: groupRows } of partitionServers(servers)) {
    for (const row of groupRows) {
      if (row.kind === 'family') {
        const instances = row.servers
          .map(server => byName.get(server.getName()))
          .filter((entry): entry is McpServerRuntime => Boolean(entry));
        rows.push({
          id: `family:${row.family}`,
          name: row.family,
          kind: 'family',
          group,
          instances: row.servers.length,
          tools: maxDefined(instances.map(entry => entry.toolsCount)),
          resources: sumDefined(instances.map(entry => entry.resourcesCount)),
          prompts: sumDefined(instances.map(entry => entry.promptsCount)),
        });
      } else {
        const entry = byName.get(row.server.getName());
        rows.push({
          id: `server:${row.server.getName()}`,
          name: row.server.getName(),
          kind: 'server',
          group,
          instances: 1,
          tools: entry?.toolsCount,
          resources: entry?.resourcesCount,
          prompts: entry?.promptsCount,
        });
      }
    }
    if (group === 'agent-platform') {
      rows.push({
        id: 'core',
        name: 'muster',
        kind: 'core',
        group,
        instances: 1,
        tools: coreTools,
      });
    }
  }

  return rows;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString();
}

/**
 * A count, or a dash where the runtime reports nothing. Tabular figures, so
 * the digits line up down the column -- bui has no per-column alignment to
 * line them up with. Returns the contents, not a `Cell`: react-aria matches a
 * cell to its column by the element the `cell` callback itself returns.
 */
function count(value: number | undefined) {
  return (
    <Text variant="body-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatCount(value)}
    </Text>
  );
}

/**
 * The tool group, what the row is, and how many instances back it each take a
 * column: separate facts about the row, comparable down the table rather than
 * markers trailing a name.
 *
 * The group repeats on its rows instead of heading them -- the bui table is
 * data-driven and has no cell that spans a row. The rows still arrive grouped:
 * `capabilityRows` emits them in `TOOL_GROUP_ORDER`.
 */
const COLUMN_CONFIG: ColumnConfig<CapabilityRow>[] = [
  {
    id: 'group',
    label: 'Group',
    cell: row => <CellText title={TOOL_GROUPS[row.group].title} />,
  },
  {
    id: 'name',
    label: 'Server',
    isRowHeader: true,
    cell: row => <CellText title={row.name} />,
  },
  {
    id: 'kind',
    label: 'Kind',
    cell: row => <CellText title={row.kind} color="secondary" />,
  },
  {
    id: 'instances',
    label: 'Instances',
    cell: row => <Cell>{count(row.instances)}</Cell>,
  },
  {
    id: 'tools',
    label: 'Tools',
    cell: row => <Cell>{count(row.tools)}</Cell>,
  },
  {
    id: 'resources',
    label: 'Resources',
    cell: row => <Cell>{count(row.resources)}</Cell>,
  },
  {
    id: 'prompts',
    label: 'Prompts',
    cell: row => <Cell>{count(row.prompts)}</Cell>,
  },
];

export interface CapabilitySurfaceProps {
  /** MCPServer CRs of the active installation. */
  servers: MCPServer[];
  installation: string;
}

/**
 * What agents can reach through this muster, per server and grouped by tool
 * group: the tools, resources and prompts each contributes to the aggregated
 * catalogue for the current session, plus muster's own core tools under Agent
 * Platform. Reads the same runtime list the MCP servers page uses for its
 * live state (react-query dedupes the two) and `list_core_tools`; the caller
 * gates it behind an authenticated session.
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

  if (runtime.error) {
    return (
      <Text variant="body-medium" color="secondary">
        Capability counts unavailable: {(runtime.error as Error).message}
      </Text>
    );
  }

  const isPending = runtime.isLoading || core.isLoading;
  const rows = capabilityRows(
    servers,
    runtime.data?.mcpServers ?? [],
    core.error ? undefined : core.data?.total,
  );

  return (
    <Paper variant="outlined" className={classes.card}>
      <Table<CapabilityRow>
        columnConfig={COLUMN_CONFIG}
        // `undefined` rather than `[]` while the counts are in flight: an empty
        // array renders the empty state, so the skeleton would never show.
        data={isPending ? undefined : rows}
        isPending={isPending}
        pagination={{ type: 'none' }}
        emptyState={
          <Text variant="body-medium" color="secondary">
            No servers registered with this muster.
          </Text>
        }
      />
      <Text
        as="p"
        variant="body-small"
        color="secondary"
        className={classes.note}
      >
        Counted for your muster session. A family's tools are shown once —
        muster deduplicates them across its instances — while resources and
        prompts are per instance and add up. A dash means the server reports
        none, or is not connected for this session.
      </Text>
    </Paper>
  );
}
