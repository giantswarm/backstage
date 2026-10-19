import { useTheme } from '@material-ui/core';
import { formatCount } from '@giantswarm/backstage-plugin-agent-platform-common';
import { StackedBarChart } from '@giantswarm/backstage-plugin-ui-react';

import type { McpUsageBucket } from '../../../apis';
import { McpUsageCard } from '../McpUsageCard';

/** Axis tick for a bucket start: hour of day for hourly, date for daily. */
function formatBucketTick(start: string, stepHours: number): string {
  const date = new Date(start);
  if (stepHours < 24) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatBucketTooltip(start: string, stepHours: number): string {
  const date = new Date(start);
  if (stepHours < 24) {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export type McpCallsByOutcomeChartProps = {
  buckets: McpUsageBucket[];
  /** The buckets' width, from the usage read: 1 (hourly) or 24 (daily). */
  stepHours: number;
};

/**
 * Tool calls per bucket, stacked by how they ended: ok, an error result the
 * tool answered with, or a call that failed to dispatch. The status colours,
 * because these are outcomes, with a legend naming them.
 */
export function McpCallsByOutcomeChart({
  buckets,
  stepHours,
}: McpCallsByOutcomeChartProps) {
  const theme = useTheme();
  return (
    <McpUsageCard title="Tool calls by outcome">
      <StackedBarChart
        data={buckets}
        xAxisKey="start"
        series={[
          { dataKey: 'ok', name: 'ok', color: theme.palette.success.main },
          {
            dataKey: 'error_result',
            name: 'error result',
            color: theme.palette.warning.main,
          },
          { dataKey: 'error', name: 'error', color: theme.palette.error.main },
        ]}
        formatXAxisTick={start => formatBucketTick(start, stepHours)}
        formatTooltipLabel={start => formatBucketTooltip(start, stepHours)}
        formatValue={formatCount}
        formatYAxisTick={formatCount}
        yAxisWidth={56}
        height={200}
        showLegend
      />
    </McpUsageCard>
  );
}
