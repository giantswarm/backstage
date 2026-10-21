import { useMemo } from 'react';
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

import type { ServerPageRow } from '../../../lib/serverGrouping';
import {
  errorRatioFigure,
  McpCallsByOutcomeChart,
  McpDataStartNote,
  McpUsageTable,
  useUsageColumns,
} from '../../McpUsage';
import { instanceUsageRows } from '../../ConnectorPage/ConnectorUsageTab';
import { useConnectorUsage } from '../../ConnectorPage/hooks/useConnectorUsage';
import { CONNECTOR_USAGE_DAYS } from '../../ConnectorPage/utils/connectorUsage';

export type ToolUsageTabProps = {
  /** The tool's name as muster exposes it, which its calls are counted under. */
  name: string;
  /** The connector that offers it: one MCPServer, or a family's instances. */
  row: ServerPageRow;
  installation: string;
  /** The connector as people call it. */
  connectorName: string;
  /** The connector's Usage tab. */
  connectorUsageHref?: string;
};

/**
 * A connector tool's Usage tab: every caller's calls to this one tool over
 * the last 30 days, from muster's dispatch metrics narrowed to the tool —
 * how many, how many failed, how fast it answered, calls per day by outcome
 * and, for a family, on which instance. Laid out as its connector's Usage
 * tab, with a way to it. The tab reads the usage itself, so the request runs
 * only while it is open.
 */
export function ToolUsageTab({
  name,
  row,
  installation,
  connectorName,
  connectorUsageHref,
}: ToolUsageTabProps) {
  const { usage, isLoading, error } = useConnectorUsage(row, installation, {
    enabled: true,
    tool: name,
  });
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
  const instanceColumns = useUsageColumns(instanceRows, {
    label: 'Instance',
    renderName: instance => instance.id,
    withP95: true,
  });

  if (isLoading) {
    return <LoadingIndicator label="Reading this tool's usage…" />;
  }
  if (error) {
    return (
      <Alert
        status="danger"
        title="Could not read this tool's usage"
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
        Every caller's calls to this tool over the last {CONNECTOR_USAGE_DAYS}{' '}
        days on {installation}.
      </Text>
      <McpDataStartNote usage={usage} windowDays={CONNECTOR_USAGE_DAYS} />

      <StatGrid>
        <Stat
          variant="tile"
          label="Tool calls"
          hint="Counts the calls muster dispatched to this tool, from agents, sessions and this portal alike."
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
      </StatGrid>

      {Math.round(totals.calls) > 0 ? (
        <>
          <McpCallsByOutcomeChart
            buckets={usage.buckets}
            stepHours={usage.step_hours}
          />
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
          title={`No calls in the last ${CONNECTOR_USAGE_DAYS} days`}
          description="Calls from agents, sessions and this portal show here once they reach this tool."
        />
      )}

      <Text as="p" variant="body-small" color="secondary">
        Counted where muster dispatches each call, so a call through call_tool
        counts for the tool it ran.
      </Text>
      {connectorUsageHref && (
        <Link href={connectorUsageHref}>{`All usage of ${connectorName}`}</Link>
      )}
    </Flex>
  );
}
