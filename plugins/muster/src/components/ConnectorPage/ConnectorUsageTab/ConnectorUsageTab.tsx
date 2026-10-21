import { ReactNode, useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link } from '@backstage/ui';
import { formatCount } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  INITIAL_ROWS,
  ShowMore,
  Stat,
} from '@giantswarm/backstage-plugin-ui-react';

import type { McpUsage } from '../../../apis';
import { withInstallationQuery } from '../../../lib/installationLink';
import type { ServerPageRow } from '../../../lib/serverGrouping';
import { usageConnectorsExternalRouteRef } from '../../../routes';
import { McpUsageTable, useUsageColumns } from '../../McpUsage';
import { useServerPageLinks } from '../../shared';
import type { ServerTools } from '../../ServerPage/useServerPageData';
import type { ConnectorUsage } from '../hooks/useConnectorUsage';
import { CONNECTOR_USAGE_DAYS } from '../utils/connectorUsage';
import { byCallsThenName, called, UsageFigures } from '../UsageFigures';

type ToolRow = {
  id: string;
  calls: number;
  errors: number;
  p95_seconds: number | null;
  /** Whether the connector offers it now, so its page can be opened. */
  offered: boolean;
};

/** The connector's tools as the tab can know them. */
export type ToolCatalogue = {
  /** The tools it offers, as far as they were read. */
  names: readonly string[];
  /** Every tool it offers was read: the list is neither truncated nor missing. */
  complete: boolean;
  /** Whether a tool's name resolves to this connector, by its prefix. */
  ownsTool: (tool: string) => boolean;
};

/**
 * Every tool the connector offers, each with its calls over the window: those
 * never called with zeros, the reason to list them at all. A tool called in
 * the window that the connector no longer offers keeps its row. Where the
 * list is incomplete (truncated, or not read), a called tool whose prefix
 * names this connector counts as offered, as the tool's own page decides.
 */
export function toolUsageRows(
  usage: McpUsage,
  catalogue: ToolCatalogue,
): ToolRow[] {
  const listed = new Set(catalogue.names);
  const isOffered = (tool: string) =>
    listed.has(tool) || (!catalogue.complete && catalogue.ownsTool(tool));
  const rows = new Map<string, ToolRow>();
  for (const name of listed) {
    rows.set(name, {
      id: name,
      calls: 0,
      errors: 0,
      p95_seconds: null,
      offered: true,
    });
  }
  for (const row of usage.top_tools) {
    rows.set(row.tool, {
      id: row.tool,
      calls: row.calls,
      errors: row.errors,
      p95_seconds: row.p95_seconds,
      offered: isOffered(row.tool),
    });
  }
  return [...rows.values()].sort(byCallsThenName);
}

/**
 * "4 of 12": the offered tools called at least once, of those offered. Just
 * the count where the connector's tool list is incomplete, which would make
 * the second number wrong.
 */
export function toolsUsedLine(rows: ToolRow[], complete: boolean): string {
  if (!complete) {
    return formatCount(rows.filter(row => called(row.calls)).length);
  }
  const offered = rows.filter(row => row.offered);
  const used = offered.filter(row => called(row.calls)).length;
  return `${formatCount(used)} of ${formatCount(offered.length)}`;
}

function toolsUsedHint(complete: boolean, truncated: boolean): string {
  if (complete) {
    return 'Counts the tools it offers that were called at least once.';
  }
  return truncated
    ? 'Counts the tools called at least once. Its tool list was cut short, so there is nothing complete to count them against.'
    : 'Counts the tools called at least once. Its tools could not be listed, so there is nothing to count them against.';
}

export type ConnectorUsageTabProps = {
  row: ServerPageRow;
  /** The connector's key in the address, which its tools' pages sit under. */
  server: string;
  installation: string;
  usage: ConnectorUsage;
  tools: ServerTools;
  /** Whether a tool's name resolves to this connector, by its prefix. */
  ownsTool: (tool: string) => boolean;
  /** Shown instead of the figures while the muster session is missing. */
  sessionGate?: ReactNode;
};

/**
 * A connector's Usage tab: every caller's tool calls to it over the last 30
 * days, from muster's dispatch metrics — how many, how many failed, how fast
 * it answered, which of its tools were used and, for a family, on which
 * instance. Laid out as the model page's Usage tab: the window first, the
 * tiles, the chart, then the tables, and a way to the Usage page. The
 * figures are {@link UsageFigures}, which a tool's Usage tab shares.
 */
export function ConnectorUsageTab({
  row,
  server,
  installation,
  usage: read,
  tools,
  ownsTool,
  sessionGate,
}: ConnectorUsageTabProps) {
  const links = useServerPageLinks();
  const usageRoute = useRouteRef(usageConnectorsExternalRouteRef);
  const usageHref = usageRoute
    ? withInstallationQuery(usageRoute(), installation)
    : undefined;

  const catalogue = useMemo<ToolCatalogue>(
    () => ({
      names: tools.tools?.map(tool => tool.name) ?? [],
      complete:
        Boolean(tools.tools && tools.tools.length > 0) && !tools.truncated,
      ownsTool,
    }),
    [tools.tools, tools.truncated, ownsTool],
  );
  const toolRows = useMemo(
    () => (read.usage ? toolUsageRows(read.usage, catalogue) : []),
    [read.usage, catalogue],
  );
  const instances = useMemo(
    () =>
      row.kind === 'family'
        ? row.servers.map(instance => instance.getName())
        : undefined,
    [row],
  );
  const toolColumns = useUsageColumns(toolRows, {
    label: 'Tool',
    renderName: tool => {
      // Its own Usage tab: the figures this row sums up, over time.
      const href = tool.offered
        ? links.tool(server, tool.id, installation, { tab: 'usage' })
        : undefined;
      const name = tools.shortName(tool.id);
      return href ? <Link href={href}>{name}</Link> : name;
    },
    withP95: true,
  });

  if (sessionGate) {
    return <>{sessionGate}</>;
  }
  return (
    <UsageFigures
      subject="connector"
      installation={installation}
      read={read}
      // The tools too: a row's link and the "of 12" both wait for the list.
      waiting={tools.isLoading}
      extraTile={
        <Stat
          variant="tile"
          label="Tools used"
          hint={toolsUsedHint(catalogue.complete, tools.truncated)}
          value={toolsUsedLine(toolRows, catalogue.complete)}
          sub={`last ${CONNECTOR_USAGE_DAYS} days`}
        />
      }
      instances={instances}
      footer={usageHref && <Link href={usageHref}>Open in Usage</Link>}
    >
      <ShowMore items={toolRows} initial={INITIAL_ROWS} noun="tool">
        {visible => <McpUsageTable rows={visible} columns={toolColumns} />}
      </ShowMore>
    </UsageFigures>
  );
}
