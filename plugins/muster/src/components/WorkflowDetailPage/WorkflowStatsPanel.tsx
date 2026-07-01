import {
  Box,
  Paper,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { StackedBarChart } from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import type { WorkflowStatsPerDay } from '../../apis';
import { formatDuration } from '../../lib/formatDuration';
import { Stat } from '../shared';

/** Minimum number of days the runs-per-day chart always spans. */
const MIN_CHART_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` date to a UTC-midnight epoch (timezone-stable). */
function parseDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Format a UTC-midnight epoch back to `YYYY-MM-DD`. */
function formatDay(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

/** Today's UTC-midnight epoch, matching the backend's `YYYY-MM-DD` days. */
function todayEpoch(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Expand the backend's sparse per-day series into a contiguous range that spans
 * at least `MIN_CHART_DAYS` days, filling absent days with zero-run entries so
 * the chart always reads as a full window even when only a single day has data.
 * Days that already carry data are preserved; the window always ends today so
 * the chart's right edge reads as "now" even when the most recent run was days
 * ago.
 */
function padPerDay(perDay: WorkflowStatsPerDay[]): WorkflowStatsPerDay[] {
  if (perDay.length === 0) {
    return perDay;
  }

  const byDate = new Map(perDay.map(day => [day.date, day]));
  const epochs = perDay.map(day => parseDay(day.date));
  // Anchor the right edge to today, but never truncate data that (somehow)
  // carries a later date.
  const end = Math.max(...epochs, todayEpoch());
  const earliest = Math.min(...epochs);
  // Reach back far enough to cover MIN_CHART_DAYS, or further if data already
  // spans a longer window.
  const start = Math.min(earliest, end - (MIN_CHART_DAYS - 1) * DAY_MS);

  const result: WorkflowStatsPerDay[] = [];
  for (let epoch = start; epoch <= end; epoch += DAY_MS) {
    const date = formatDay(epoch);
    result.push(byDate.get(date) ?? { date, completed: 0, failed: 0 });
  }
  return result;
}

/** Short x-axis tick, e.g. `Jun 30`. Formatted in UTC to match the day keys. */
function formatAxisDate(date: string): string {
  return new Date(parseDay(date)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Fuller tooltip heading, e.g. `Mon, Jun 30`. */
function formatTooltipDate(date: string): string {
  return new Date(parseDay(date)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const useStyles = makeStyles((theme: Theme) => ({
  statRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2, 5),
  },
  breakdown: {
    marginTop: theme.spacing(2),
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1, 2.5),
    color: theme.palette.text.secondary,
  },
  outcome: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  outcomeValue: {
    fontVariantNumeric: 'tabular-nums',
    color: theme.palette.text.primary,
  },
  chartCard: {
    marginTop: theme.spacing(3),
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  chartTitle: {
    marginBottom: theme.spacing(1.5),
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: 11,
    fontWeight: 500,
    color: theme.palette.text.secondary,
  },
  note: {
    display: 'block',
    marginTop: theme.spacing(1.5),
    color: theme.palette.text.secondary,
  },
}));

export interface WorkflowStatsPanelProps {
  name: string;
  installation?: string;
}

/**
 * Run statistics for a workflow, sourced from the muster-backend's derived
 * `/workflows/:name/stats` (computed over a bounded execution sample). Renders
 * the mockup's Statistics block: a Stat row, a completed/failed outcome
 * breakdown, and a recharts stacked bar of runs per day (via the shared
 * `StackedBarChart` from ui-react).
 *
 * ponytail: the breakdown is two-way (completed/failed) -- muster's execution
 * summaries do not carry the mockup's tolerated-step-failure dimension. Upgrade
 * path: a richer summary from the backend to add that third dimension.
 */
export function WorkflowStatsPanel({
  name,
  installation,
}: WorkflowStatsPanelProps) {
  const classes = useStyles();
  const theme = useTheme();
  const musterApi = useApi(musterApiRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'workflow-stats', installation, name],
    queryFn: () => musterApi.getWorkflowStats(name, installation),
    enabled: name !== '',
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <Typography variant="body2" color="textSecondary">
        Statistics unavailable: {(error as Error).message}
      </Typography>
    );
  }
  if (!data || data.runs === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No engine- or agent-driven executions recorded for this workflow yet.
        Runs launched from the tool explorer are not recorded here.
      </Typography>
    );
  }

  const successRatePct =
    data.success_rate !== null ? Math.round(data.success_rate * 100) : null;
  const successRate = successRatePct !== null ? `${successRatePct}%` : '—';
  let successTone: 'ok' | 'warning' | undefined;
  if (successRatePct !== null) {
    successTone = successRatePct >= 95 ? 'ok' : 'warning';
  }
  const avg =
    data.avg_duration_ms !== null ? formatDuration(data.avg_duration_ms) : '—';
  const max =
    data.max_duration_ms !== null ? formatDuration(data.max_duration_ms) : '—';

  const perDay = padPerDay(data.per_day);

  const completedColor = theme.palette.success.main;
  const failedColor = theme.palette.error.main;

  return (
    <Box>
      <Box className={classes.statRow}>
        <Stat label="Runs" value={data.runs.toLocaleString()} />
        <Stat label="Success rate" value={successRate} tone={successTone} />
        <Stat label="Avg duration" value={avg} />
        <Stat label="Max duration" value={max} />
      </Box>

      <Box className={classes.breakdown}>
        <span className={classes.outcome}>
          <span
            className={classes.dot}
            style={{ backgroundColor: completedColor }}
          />
          <span className={classes.outcomeValue}>
            {data.completed.toLocaleString()}
          </span>
          completed
        </span>
        <span className={classes.outcome}>
          <span
            className={classes.dot}
            style={{ backgroundColor: failedColor }}
          />
          <span className={classes.outcomeValue}>
            {data.failed.toLocaleString()}
          </span>
          failed
        </span>
      </Box>

      {perDay.length > 0 && (
        <Paper variant="outlined" className={classes.chartCard}>
          <Typography component="div" className={classes.chartTitle}>
            Runs per day
          </Typography>
          <StackedBarChart
            data={perDay}
            xAxisKey="date"
            series={[
              {
                dataKey: 'completed',
                name: 'completed',
                color: completedColor,
              },
              { dataKey: 'failed', name: 'failed', color: failedColor },
            ]}
            formatXAxisTick={formatAxisDate}
            formatTooltipLabel={formatTooltipDate}
          />
        </Paper>
      )}

      {data.sampled < data.runs && (
        <Typography variant="caption" className={classes.note}>
          Rates and durations computed over the most recent {data.sampled} of{' '}
          {data.runs} runs.
        </Typography>
      )}
    </Box>
  );
}
