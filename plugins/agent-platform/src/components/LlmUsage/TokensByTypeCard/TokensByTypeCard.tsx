import { useMemo } from 'react';
import { useTheme } from '@material-ui/core';
import {
  categoricalColors,
  StackedBarChart,
  type StackedBarChartSeries,
} from '@giantswarm/backstage-plugin-ui-react';
import type { LlmDailySeries } from '../../../lib/llmUsage';
import { formatCount, formatTokens } from '../../../lib/formatNumbers';
import { formatDayTick, formatDayTooltip } from '../../../lib/formatDay';
import { UsageCard } from '../UsageCard';

/**
 * The four token types the gateway bills, in the order they cost.
 *
 * Fixed rather than derived from the response: these are a partition of one
 * quantity, not a ranking, so their colours must not move when a day's mix
 * changes. Ordered cheapest-first from the base of the stack, which puts the
 * cache reads — the ones that are *saving* money — at the bottom where the
 * stack's growth is easiest to read against.
 */
const TOKEN_TYPE_SERIES = [
  { key: 'input_cache_read', label: 'cache read' },
  { key: 'input_cache_write', label: 'cache write' },
  { key: 'input', label: 'input' },
  { key: 'output', label: 'output' },
] as const;

/**
 * Tokens per day, stacked by token type.
 *
 * **These four do belong on one stack**, unlike the input and output charts on
 * the sessions tab which are deliberately two with independent scales. There
 * the two series differ by two orders of magnitude and stacking drew output as
 * an invisible hairline; here the whole point is the *proportion* between
 * types — a cache-read band that shrinks is a bill about to grow — and a
 * proportion needs a shared scale to be visible at all.
 */
export function TokensByTypeCard({
  daily,
  note,
}: {
  daily: LlmDailySeries;
  note?: string;
}) {
  const theme = useTheme();

  const series = useMemo<StackedBarChartSeries[]>(() => {
    const palette = categoricalColors(theme);
    const present = new Set(daily.series);
    return TOKEN_TYPE_SERIES.filter(type => present.has(type.key)).map(
      // Indexed off the fixed list, not the filtered one, so a type absent
      // from one installation does not shift the others' colours.
      type => ({
        dataKey: type.key,
        name: type.label,
        color:
          palette[TOKEN_TYPE_SERIES.findIndex(t => t.key === type.key)] ??
          theme.palette.text.secondary,
      }),
    );
  }, [daily.series, theme]);

  return (
    <UsageCard title="Tokens per day, by type" note={note} wide>
      <StackedBarChart
        data={daily.rows}
        xAxisKey="day"
        series={series}
        height={200}
        showLegend
        formatXAxisTick={formatDayTick}
        formatTooltipLabel={formatDayTooltip}
        formatYAxisTick={formatTokens}
        yAxisWidth={56}
        formatValue={formatCount}
      />
    </UsageCard>
  );
}
