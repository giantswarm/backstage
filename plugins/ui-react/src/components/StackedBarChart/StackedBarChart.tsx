import { useTheme } from '@material-ui/core/styles';
import { Box, Paper, Typography } from '@material-ui/core';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** One stacked segment: which field it reads, how it's labelled, and its color. */
export interface StackedBarChartSeries {
  /** Key in each data row holding this segment's numeric value. */
  dataKey: string;
  /** Human-readable label shown in the tooltip. */
  name: string;
  /** Bar fill color (typically pulled from the MUI theme by the caller). */
  color: string;
}

export interface StackedBarChartProps<T extends object> {
  /** Rows to plot, one bar per row. */
  data: T[];
  /** Key holding the category (x-axis) value for each row. */
  xAxisKey: keyof T & string;
  /**
   * Stacked segments, rendered bottom-to-top in array order (first entry sits
   * at the base of the stack).
   */
  series: StackedBarChartSeries[];
  /** Chart height in pixels. Width always fills the container. */
  height?: number;
  /** Format an x-axis tick label (e.g. shorten an ISO date). */
  formatXAxisTick?: (value: string) => string;
  /** Format the category heading shown in the tooltip. */
  formatTooltipLabel?: (value: string) => string;
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
  headingColor: string;
  paperBackground: string;
  borderColor: string;
  secondaryTextColor: string;
  formatLabel?: (value: string) => string;
}

/** Themed replacement for recharts' default (unthemed) tooltip. */
function ChartTooltip({
  active,
  label,
  payload,
  headingColor,
  paperBackground,
  borderColor,
  secondaryTextColor,
  formatLabel,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const heading =
    label !== undefined && formatLabel ? formatLabel(label) : label;

  return (
    <Paper
      elevation={2}
      style={{
        backgroundColor: paperBackground,
        border: `1px solid ${borderColor}`,
        padding: 8,
      }}
    >
      {heading !== undefined && (
        <Typography
          variant="caption"
          component="div"
          style={{ color: headingColor, fontWeight: 600, marginBottom: 4 }}
        >
          {heading}
        </Typography>
      )}
      {/* Bottom-to-top stack reads top-to-bottom in the tooltip. */}
      {[...payload].reverse().map(entry => (
        <Box
          key={String(entry.dataKey)}
          display="flex"
          alignItems="center"
          style={{ gap: 6 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: entry.color,
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" style={{ color: secondaryTextColor }}>
            {entry.value} {entry.name}
          </Typography>
        </Box>
      ))}
    </Paper>
  );
}

/**
 * A theme-aware stacked bar chart built on recharts. Colors, axis text, grid,
 * and tooltip all read from the active MUI theme so charts look native in both
 * light and dark mode. Consumers pass plain data rows plus a `series` config
 * describing each stacked segment — recharts stays an implementation detail.
 */
export function StackedBarChart<T extends object>({
  data,
  xAxisKey,
  series,
  height = 160,
  formatXAxisTick,
  formatTooltipLabel,
}: StackedBarChartProps<T>) {
  const theme = useTheme();

  const axisColor = theme.palette.text.secondary;
  const gridColor = theme.palette.divider;
  const tickStyle = { fill: axisColor, fontSize: 11 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* recharts infers its DataPointType from `data`; keep that inference
          permissive (unknown) so string dataKeys type-check regardless of the
          caller's concrete row type T. */}
      <BarChart
        data={data as unknown[]}
        margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
      >
        <CartesianGrid
          vertical={false}
          stroke={gridColor}
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey={xAxisKey as string}
          tick={tickStyle}
          tickFormatter={formatXAxisTick}
          stroke={gridColor}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={tickStyle}
          stroke={gridColor}
          width={40}
        />
        <Tooltip
          cursor={{ fill: theme.palette.action.hover }}
          content={
            <ChartTooltip
              headingColor={theme.palette.text.primary}
              paperBackground={theme.palette.background.paper}
              borderColor={gridColor}
              secondaryTextColor={theme.palette.text.secondary}
              formatLabel={formatTooltipLabel}
            />
          }
        />
        {series.map(s => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            stackId="stack"
            fill={s.color}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
