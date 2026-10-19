import { ReactNode, useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Link, Text } from '@backstage/ui';
import {
  formatCount,
  formatSeconds,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  EmptyStateCard,
  INITIAL_ROWS,
  LoadingIndicator,
  ShowMore,
  Stat,
  StatGrid,
} from '@giantswarm/backstage-plugin-ui-react';

import type { McpUsage } from '../../../apis';
import { withInstallationQuery } from '../../../lib/installationLink';
import type { ServerPageRow } from '../../../lib/serverGrouping';
import { usageConnectorsExternalRouteRef } from '../../../routes';
import {
  errorRatioFigure,
  McpCallsByOutcomeChart,
  McpDataStartNote,
  McpUsageTable,
  useUsageColumns,
} from '../../McpUsage';
import { useServerPageLinks } from '../../shared';
import type { ServerTools } from '../../ServerPage/useServerPageData';
import { CONNECTOR_USAGE_DAYS, ConnectorUsage } from '../useConnectorUsage';

type ToolRow = {
  id: string;
  calls: number;
  errors: number;
  p95_seconds: number | null;
  /** Whether the connector offers it now, so its page can be opened. */
  offered: boolean;
};

type InstanceRow = {
  id: string;
  calls: number;
  errors: number;
  p95_seconds: number | null;
};

/** A count as the tables show it: `increase()` estimates fractions. */
function called(calls: number): boolean {
  return Math.round(calls) > 0;
}

/** Busiest first, then by name, so the tools never called sit at the end. */
function byCallsThenName<T extends { id: string; calls: number }>(a: T, b: T) {
  return b.calls - a.calls || a.id.localeCompare(b.id);
}

/**
 * Every tool the connector offers, each with its calls over the window: those
 * never called with zeros, the reason to list them at all. A tool called in
 * the window that the connector no longer offers keeps its row.
 */
export function toolUsageRows(
  usage: McpUsage,
  offered: readonly string[] | undefined,
): ToolRow[] {
  const listed = new Set(offered ?? []);
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
      offered: listed.has(row.tool),
    });
  }
  return [...rows.values()].sort(byCallsThenName);
}

/** Every instance of a family, each with its calls; idle ones with zeros. */
export function instanceUsageRows(
  usage: McpUsage,
  instances: readonly string[],
): InstanceRow[] {
  const byName = new Map(usage.servers.map(row => [row.server, row]));
  return instances
    .map(name => {
      const row = byName.get(name);
      return {
        id: name,
        calls: row?.calls ?? 0,
        errors: row?.errors ?? 0,
        p95_seconds: row?.p95_seconds ?? null,
      };
    })
    .sort(byCallsThenName);
}

/**
 * "4 of 12": the offered tools called at least once, of those offered. Just
 * the count where the connector's tools could not be listed.
 */
export function toolsUsedLine(rows: ToolRow[], toolsListed: boolean): string {
  if (!toolsListed) {
    return formatCount(rows.filter(row => called(row.calls)).length);
  }
  const offered = rows.filter(row => row.offered);
  const used = offered.filter(row => called(row.calls)).length;
  return `${formatCount(used)} of ${formatCount(offered.length)}`;
}

export type ConnectorUsageTabProps = {
  row: ServerPageRow;
  /** The connector's key in the address, which its tools' pages sit under. */
  server: string;
  installation: string;
  usage: ConnectorUsage;
  tools: ServerTools;
  /** Shown instead of the figures while the muster session is missing. */
  sessionGate?: ReactNode;
};

/**
 * A connector's Usage tab: every caller's tool calls to it over the last 30
 * days, from muster's dispatch metrics — how many, how many failed, how fast
 * it answered, which of its tools were used and, for a family, on which
 * instance. Laid out as the model page's Usage tab: the window first, the
 * tiles, the chart, then the tables, and a way to the Usage page.
 */
export function ConnectorUsageTab({
  row,
  server,
  installation,
  usage: { usage, isLoading, error },
  tools,
  sessionGate,
}: ConnectorUsageTabProps) {
  const links = useServerPageLinks();
  const usageRoute = useRouteRef(usageConnectorsExternalRouteRef);
  const usageHref = usageRoute
    ? withInstallationQuery(usageRoute(), installation)
    : undefined;

  const offered = useMemo(
    () => tools.tools?.map(tool => tool.name),
    [tools.tools],
  );
  const toolsListed = Boolean(offered && offered.length > 0);
  const toolRows = useMemo(
    () => (usage ? toolUsageRows(usage, offered) : []),
    [usage, offered],
  );
  const instanceRows = useMemo(
    () =>
      usage && row.kind === 'family'
        ? instanceUsageRows(
            usage,
            row.servers.map(instance => instance.getName()),
          )
        : [],
    [usage, row],
  );
  const toolColumns = useUsageColumns(toolRows, {
    label: 'Tool',
    renderName: tool => {
      const href = tool.offered
        ? links.tool(server, tool.id, installation)
        : undefined;
      const name = tools.shortName(tool.id);
      return href ? <Link href={href}>{name}</Link> : name;
    },
    withP95: true,
  });
  const instanceColumns = useUsageColumns(instanceRows, {
    label: 'Instance',
    renderName: instance => instance.id,
    withP95: true,
  });

  if (sessionGate) {
    return <>{sessionGate}</>;
  }
  if (isLoading) {
    return <LoadingIndicator label="Reading this connector's usage…" />;
  }
  if (error) {
    return (
      <Alert
        status="danger"
        title="Could not read this connector's usage"
        description={error.message}
      />
    );
  }
  if (!usage) {
    return null;
  }
  if (!usage.available) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Usage metrics are not available for this environment:{' '}
        {usage.reason ?? 'unknown reason'}
      </Text>
    );
  }

  const { totals } = usage;
  const errorRatio = errorRatioFigure(totals.error_ratio);
  const sub = `every caller's, last ${CONNECTOR_USAGE_DAYS} days`;

  return (
    <Flex direction="column" gap="4">
      <Text as="p" variant="body-medium" color="secondary">
        Every caller's tool calls to this connector over the last{' '}
        {CONNECTOR_USAGE_DAYS} days on {installation}.
      </Text>
      <McpDataStartNote usage={usage} windowDays={CONNECTOR_USAGE_DAYS} />

      <StatGrid>
        <Stat
          variant="tile"
          label="Tool calls"
          hint="Counts the calls muster dispatched to this connector, from agents, sessions and this portal alike."
          value={formatCount(totals.calls)}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="Error ratio"
          hint="Shows the share of calls that failed to dispatch or returned an error. Amber above 5%."
          value={errorRatio.value}
          tone={errorRatio.tone}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="p95 latency"
          hint="Shows the 95th-percentile response time. It is estimated from a histogram, so read it as a range."
          value={formatSeconds(totals.p95_seconds)}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="Tools used"
          hint={
            toolsListed
              ? 'Counts the tools it offers that were called at least once.'
              : 'Counts the tools called at least once. Its tools could not be listed, so there is nothing to count them against.'
          }
          value={toolsUsedLine(toolRows, toolsListed)}
          sub={`last ${CONNECTOR_USAGE_DAYS} days`}
        />
      </StatGrid>

      {called(totals.calls) ? (
        <>
          <McpCallsByOutcomeChart
            buckets={usage.buckets}
            stepHours={usage.step_hours}
          />
          <ShowMore items={toolRows} initial={INITIAL_ROWS} noun="tool">
            {visible => <McpUsageTable rows={visible} columns={toolColumns} />}
          </ShowMore>
          {row.kind === 'family' && (
            <ShowMore
              items={instanceRows}
              initial={INITIAL_ROWS}
              noun="instance"
            >
              {visible => (
                <McpUsageTable rows={visible} columns={instanceColumns} />
              )}
            </ShowMore>
          )}
        </>
      ) : (
        <EmptyStateCard
          title={`No tool calls in the last ${CONNECTOR_USAGE_DAYS} days`}
          description="Calls from agents, sessions and this portal show here once they reach this connector."
        />
      )}

      <Text as="p" variant="body-small" color="secondary">
        Counted where muster dispatches each call, so a call through call_tool
        counts for the tool it ran.
      </Text>
      {usageHref && <Link href={usageHref}>Open in Usage</Link>}
    </Flex>
  );
}
