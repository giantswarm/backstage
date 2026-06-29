import {
  Box,
  Paper,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { formatDuration } from '../../lib/formatDuration';
import { Stat } from '../shared';

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
  chart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 2,
    height: 160,
  },
  barColumn: {
    flex: '1 1 0',
    minWidth: 3,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    height: '100%',
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
 * breakdown, and a dependency-free CSS stacked bar of runs per day.
 *
 * ponytail: the per-day bar is a hand-rolled CSS chart, not a charting library,
 * and the breakdown is two-way (completed/failed) -- muster's execution
 * summaries do not carry the mockup's tolerated-step-failure dimension. Upgrade
 * path: a richer summary from the backend plus a chart lib if interaction is
 * needed.
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

  const maxPerDay = data.per_day.reduce(
    (acc, day) => Math.max(acc, day.completed + day.failed),
    0,
  );

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

      {data.per_day.length > 0 && maxPerDay > 0 && (
        <Paper variant="outlined" className={classes.chartCard}>
          <Typography component="div" className={classes.chartTitle}>
            Runs per day
          </Typography>
          <Box className={classes.chart}>
            {data.per_day.map(day => {
              const total = day.completed + day.failed;
              const heightPct = (total / maxPerDay) * 100;
              const completedShare = total > 0 ? day.completed / total : 0;
              return (
                <Tooltip
                  key={day.date}
                  arrow
                  title={`${day.date}: ${day.completed} completed, ${day.failed} failed`}
                >
                  <div className={classes.barColumn}>
                    <div
                      style={{
                        height: `${heightPct}%`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <div
                        style={{
                          height: `${(1 - completedShare) * 100}%`,
                          backgroundColor: failedColor,
                        }}
                      />
                      <div
                        style={{
                          height: `${completedShare * 100}%`,
                          backgroundColor: completedColor,
                        }}
                      />
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </Box>
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
