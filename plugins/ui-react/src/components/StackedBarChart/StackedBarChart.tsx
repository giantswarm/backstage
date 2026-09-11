import { useTheme } from '@material-ui/core/styles';
import { Box, Paper, Typography } from '@material-ui/core';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  /**
   * Format a y-axis tick (e.g. `1432871` as `1.4M`).
   *
   * Widen {@link yAxisWidth} to match: the default gutter fits about four
   * digits, so a six- or seven-digit series clips without both.
   */
  formatYAxisTick?: (value: number) => string;
  /** Width reserved for the y-axis, in pixels. Defaults to 40. */
  yAxisWidth?: number;
  /**
   * Cap on a single bar's width, in pixels. Defaults to 48.
   *
   * recharts divides the plot area by the row count, so a series with two or
   * three rows draws bars a third of the chart wide — which reads as a
   * different kind of chart, and at one row as one enormous value. A dense
   * series (a row per day of the window, zeros included) is the real fix; this
   * is the floor under it, and it only ever narrows a bar.
   */
  maxBarWidth?: number;
  /**
   * Show a legend under the chart. Defaults to `false`.
   *
   * **Switch it on for any chart with more than one series.** Without it the
   * only thing telling two segments apart is their fill, which is exactly what
   * a colour-blind reader cannot use — and what the tooltip only reveals on
   * hover, so never on a printout or a screenshot. Off by default solely
   * because the existing single-series charts have no use for one.
   */
  showLegend?: boolean;
  /**
   * Allow fractional y-axis ticks. Defaults to `false`.
   *
   * Counts want whole ticks; money does not — a cost series topping out at
   * $0.40 collapses to a single `0` tick without this.
   */
  allowDecimalTicks?: boolean;
  /**
   * Format a value in the tooltip (thousands separators, or the same compact
   * form as the axis). Unformatted, a seven-digit integer reads as a run of
   * digits.
   */
  formatValue?: (value: number) => string;
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
  formatValue?: (value: number) => string;
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
  formatValue,
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
            {entry.value !== undefined && formatValue
              ? formatValue(entry.value)
              : entry.value}{' '}
            {entry.name}
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
  formatYAxisTick,
  yAxisWidth = 40,
  maxBarWidth = 48,
  showLegend = false,
  allowDecimalTicks = false,
  formatValue,
}: StackedBarChartProps<T>) {
  const theme = useTheme();

  const axisColor = theme.palette.text.secondary;
  const gridColor = theme.palette.divider;
  const tickStyle = { fill: axisColor, fontSize: 11 };
  const surface = theme.palette.background.paper;

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
          allowDecimals={allowDecimalTicks}
          tick={tickStyle}
          tickFormatter={formatYAxisTick}
          stroke={gridColor}
          width={yAxisWidth}
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
              formatValue={formatValue}
            />
          }
        />
        {showLegend && (
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            // Legend text wears an ink token, never the series colour: the
            // swatch beside it already carries the identity, and coloured
            // label text is what pushes a low-contrast hue onto type.
            formatter={value => (
              <span style={{ color: axisColor, fontSize: 11 }}>{value}</span>
            )}
          />
        )}
        {series.map(s => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            stackId="stack"
            fill={s.color}
            // A hairline of the surface colour between stacked segments, so
            // two adjacent fills read as two even where their hues are close.
            // Painted rather than spaced because recharts stacks segments
            // flush; a single series draws no seam and so takes none.
            stroke={series.length > 1 ? surface : undefined}
            strokeWidth={series.length > 1 ? 1 : 0}
            maxBarSize={maxBarWidth}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
