import { makeStyles, Paper, Theme, useTheme } from '@material-ui/core';
import {
  StackedBarChart,
  type StackedBarChartSeries,
} from '@giantswarm/backstage-plugin-ui-react';
import { UsageDayEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { formatCount, formatTokens } from '../../lib/formatNumbers';
import { formatDayTick, formatDayTooltip } from '../../lib/formatDay';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    flex: '1 1 380px',
    minWidth: 0,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
}));

export type TokensPerDayCardProps = {
  title: string;
  data: UsageDayEntry[];
  dataKey: 'inputTokens' | 'outputTokens';
  /** 'input' picks the primary colour, 'output' the success one. */
  variant: 'input' | 'output';
};

/**
 * One token series per day.
 *
 * **Rendered twice rather than as one stacked chart**, and the two have
 * deliberately **independent y-scales**. Input runs roughly a hundred times
 * output on real data — a measured 4-turn session reached 1.4M prompt tokens
 * against ~15k completion — so stacking them draws output as an invisible
 * hairline and a shared domain would flatten it just the same. Anyone
 * "unifying" these undoes the only reason there are two.
 */
export function TokensPerDayCard({
  title,
  data,
  dataKey,
  variant,
}: TokensPerDayCardProps) {
  const classes = useStyles();
  const theme = useTheme();

  const series: StackedBarChartSeries[] = [
    {
      dataKey,
      name: 'tokens',
      // From the theme rather than a literal: the chart is theme-aware and
      // expects its caller to be too.
      color:
        variant === 'input'
          ? theme.palette.primary.main
          : theme.palette.success.main,
    },
  ];

  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.title}>{title}</div>
      <StackedBarChart<UsageDayEntry>
        data={data}
        xAxisKey="day"
        series={series}
        height={180}
        formatXAxisTick={formatDayTick}
        formatTooltipLabel={formatDayTooltip}
        // A day can reach seven digits, which clips the default gutter and
        // reads as a run of digits in the tooltip.
        formatYAxisTick={formatTokens}
        yAxisWidth={56}
        formatValue={formatCount}
      />
    </Paper>
  );
}
