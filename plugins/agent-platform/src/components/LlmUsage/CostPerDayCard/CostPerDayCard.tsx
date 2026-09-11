import { useMemo } from 'react';
import { useTheme } from '@material-ui/core';
import {
  assignSeriesColors,
  MAX_CATEGORICAL_SERIES,
  OTHER_SERIES_LABEL,
  StackedBarChart,
  type StackedBarChartSeries,
} from '@giantswarm/backstage-plugin-ui-react';
import { foldSeries, type LlmDailySeries } from '../../../lib/llmUsage';
import { formatUsd } from '../../../lib/formatNumbers';
import { formatDayTick, formatDayTooltip } from '../../../lib/formatDay';
import { UsageCard } from '../UsageCard';

/**
 * Spend per day, stacked by the model that answered.
 *
 * Stacked rather than two charts, unlike the token cards: these are all money,
 * on one scale, and the stack's height is the day's bill — the figure the
 * chart exists to show. The models sharing a scale is the point.
 *
 * `foldSeries` caps the stack at the palette's length so a long tail of models
 * pools into one grey band instead of demanding a ninth, unvalidated hue.
 */
export function CostPerDayCard({
  daily,
  note,
}: {
  daily: LlmDailySeries;
  note?: string;
}) {
  const theme = useTheme();

  const { rows, series } = useMemo(() => {
    const folded = foldSeries(
      daily,
      MAX_CATEGORICAL_SERIES,
      OTHER_SERIES_LABEL,
    );
    const { colors } = assignSeriesColors(folded.series, theme);

    // Bottom-to-top in array order, so the biggest spender sits at the base of
    // every bar and the eye follows one boundary rather than a shuffling one.
    const chartSeries: StackedBarChartSeries[] = folded.series.map(key => ({
      dataKey: key,
      name: key,
      color: colors.get(key) ?? theme.palette.text.secondary,
    }));

    return { rows: folded.rows, series: chartSeries };
  }, [daily, theme]);

  return (
    <UsageCard title="Cost per day" note={note} wide>
      <StackedBarChart
        data={rows}
        xAxisKey="day"
        series={series}
        height={200}
        showLegend
        // Money, not counts: a series topping out under a dollar collapses to a
        // single `0` tick with whole-number ticks.
        allowDecimalTicks
        formatXAxisTick={formatDayTick}
        formatTooltipLabel={formatDayTooltip}
        formatYAxisTick={formatUsd}
        yAxisWidth={64}
        formatValue={formatUsd}
      />
    </UsageCard>
  );
}
