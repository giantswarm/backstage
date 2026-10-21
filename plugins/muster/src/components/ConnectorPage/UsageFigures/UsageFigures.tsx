import { ReactNode, useMemo } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import {
  formatCount,
  formatSeconds,
  type UsageWindowDays,
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
import {
  errorRatioFigure,
  McpCallsByOutcomeChart,
  McpDataStartNote,
  McpUsageTable,
  useUsageColumns,
} from '../../McpUsage';
import type { ConnectorUsage } from '../hooks/useConnectorUsage';
import { CONNECTOR_USAGE_DAYS } from '../utils/connectorUsage';

type InstanceRow = {
  id: string;
  calls: number;
  errors: number;
  p95_seconds: number | null;
};

/** A count as the tables show it: `increase()` estimates fractions. */
export function called(calls: number): boolean {
  return Math.round(calls) > 0;
}

/** Busiest first, then by name, so the idle ones sit at the end. */
export function byCallsThenName<T extends { id: string; calls: number }>(
  a: T,
  b: T,
) {
  return b.calls - a.calls || a.id.localeCompare(b.id);
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

/** What the figures are of, in the words each state uses. */
const SUBJECTS = {
  connector: {
    intro: "Every caller's tool calls to this connector",
    reading: "Reading this connector's usage…",
    failed: "Could not read this connector's usage",
    callsHint:
      'Counts the calls muster dispatched to this connector, from agents, sessions and this portal alike.',
    noCalls: 'No tool calls',
    reach: 'this connector',
  },
  tool: {
    intro: "Every caller's calls to this tool",
    reading: "Reading this tool's usage…",
    failed: "Could not read this tool's usage",
    callsHint:
      'Counts the calls muster dispatched to this tool, from agents, sessions and this portal alike.',
    noCalls: 'No calls',
    reach: 'this tool',
  },
} as const;

export type UsageFiguresProps = {
  /** Whose calls these are: a connector's, or one of its tools'. */
  subject: keyof typeof SUBJECTS;
  installation: string;
  /**
   * The window the read covers: the `?window=` the tab opened with (from
   * Usage → Connectors), else {@link CONNECTOR_USAGE_DAYS}.
   */
  days?: UsageWindowDays;
  read: ConnectorUsage;
  /** Something else the figures wait for, such as the connector's tools. */
  waiting?: boolean;
  /** A tile after p95 latency (the connector's Tools used). */
  extraTile?: ReactNode;
  /** A family's instances, for a table of each one's figures. */
  instances?: readonly string[];
  /** Tables between the chart and the instances (the connector's tools). */
  children?: ReactNode;
  /** The way on, after the footnote. */
  footer?: ReactNode;
};

/**
 * The body of a connector's and a tool's Usage tab: every caller's calls over
 * the last 30 days (or the window the tab opened with), from muster's dispatch metrics — the window and where the
 * records start, the tiles (calls, error ratio, p95 latency), calls per day
 * by outcome, the tables and, for a family, each instance's figures — and
 * each state the read can be in.
 */
export function UsageFigures({
  subject,
  installation,
  days = CONNECTOR_USAGE_DAYS,
  read: { usage, isLoading, error },
  waiting = false,
  extraTile,
  instances,
  children,
  footer,
}: UsageFiguresProps) {
  const words = SUBJECTS[subject];
  const instanceRows = useMemo(
    () => (usage && instances ? instanceUsageRows(usage, instances) : []),
    [usage, instances],
  );
  const instanceColumns = useUsageColumns(instanceRows, {
    label: 'Instance',
    renderName: instance => instance.id,
    withP95: true,
  });

  if (isLoading || waiting) {
    return <LoadingIndicator label={words.reading} />;
  }
  if (error) {
    return (
      <Alert status="danger" title={words.failed} description={error.message} />
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
  const sub = `every caller's, last ${days} days`;

  return (
    <Flex direction="column" gap="4">
      <Text as="p" variant="body-medium" color="secondary">
        {words.intro} over the last {days} days on {installation}.
      </Text>
      <McpDataStartNote usage={usage} windowDays={days} />

      <StatGrid>
        <Stat
          variant="tile"
          label="Tool calls"
          hint={words.callsHint}
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
        {extraTile}
      </StatGrid>

      {called(totals.calls) ? (
        <>
          <McpCallsByOutcomeChart
            buckets={usage.buckets}
            stepHours={usage.step_hours}
          />
          {children}
          {instances && (
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
          title={`${words.noCalls} in the last ${days} days`}
          description={`Calls from agents, sessions and this portal show here once they reach ${words.reach}.`}
        />
      )}

      <Text as="p" variant="body-small" color="secondary">
        Counted where muster dispatches each call, so a call through call_tool
        counts for the tool it ran.
      </Text>
      {footer}
    </Flex>
  );
}
