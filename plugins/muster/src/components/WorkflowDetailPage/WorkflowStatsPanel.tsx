import {
  Box,
  Grid,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { InfoCard, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { formatDuration } from '../../lib/formatDuration';

const useStyles = makeStyles((theme: Theme) => ({
  metric: {
    display: 'flex',
    flexDirection: 'column',
  },
  metricValue: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.1,
  },
  metricLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
  },
  chart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 2,
    height: 80,
    marginTop: theme.spacing(1),
  },
  barColumn: {
    flex: '1 1 0',
    minWidth: 4,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barCompleted: {
    backgroundColor: theme.palette.success.main,
  },
  barFailed: {
    backgroundColor: theme.palette.error.main,
  },
  legend: {
    display: 'flex',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  note: {
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(1),
  },
}));

const Metric = ({ value, label }: { value: string; label: string }) => {
  const classes = useStyles();
  return (
    <Box className={classes.metric}>
      <span className={classes.metricValue}>{value}</span>
      <span className={classes.metricLabel}>{label}</span>
    </Box>
  );
};

export interface WorkflowStatsPanelProps {
  name: string;
  installation?: string;
}

/**
 * Run statistics for a workflow, sourced from the muster-backend's derived
 * `/workflows/:name/stats` (computed over a bounded execution sample). Includes
 * a dependency-free CSS stacked bar of completed-vs-failed runs per day.
 *
 * ponytail: the per-day bar is a hand-rolled CSS chart, not a charting library.
 * Upgrade path: swap for a real chart if richer interaction is needed.
 */
export function WorkflowStatsPanel({
  name,
  installation,
}: WorkflowStatsPanelProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'workflow-stats', installation, name],
    queryFn: () => musterApi.getWorkflowStats(name, installation),
    enabled: name !== '',
  });

  let content;
  if (isLoading) {
    content = <Progress />;
  } else if (error) {
    content = (
      <Typography variant="body2" className={classes.note}>
        Statistics unavailable: {(error as Error).message}
      </Typography>
    );
  } else if (!data || data.runs === 0) {
    content = (
      <Typography variant="body2" className={classes.note}>
        No executions recorded for this workflow yet.
      </Typography>
    );
  } else {
    const successRate =
      data.success_rate !== null
        ? `${Math.round(data.success_rate * 100)}%`
        : '-';
    const avg =
      data.avg_duration_ms !== null
        ? formatDuration(data.avg_duration_ms)
        : '-';
    const max =
      data.max_duration_ms !== null
        ? formatDuration(data.max_duration_ms)
        : '-';

    const maxPerDay = data.per_day.reduce(
      (acc, day) => Math.max(acc, day.completed + day.failed),
      0,
    );

    content = (
      <>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Metric value={String(data.runs)} label="Runs" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <Metric value={successRate} label="Success rate" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <Metric value={avg} label="Avg duration" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <Metric value={max} label="Max duration" />
          </Grid>
        </Grid>

        {data.per_day.length > 0 && maxPerDay > 0 && (
          <>
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
                          className={classes.barFailed}
                          style={{ height: `${(1 - completedShare) * 100}%` }}
                        />
                        <div
                          className={classes.barCompleted}
                          style={{ height: `${completedShare * 100}%` }}
                        />
                      </div>
                    </div>
                  </Tooltip>
                );
              })}
            </Box>
            <Box className={classes.legend}>
              <span className={classes.legendItem}>
                <span className={`${classes.swatch} ${classes.barCompleted}`} />
                completed
              </span>
              <span className={classes.legendItem}>
                <span className={`${classes.swatch} ${classes.barFailed}`} />
                failed
              </span>
            </Box>
          </>
        )}

        {data.sampled < data.runs && (
          <Typography variant="caption" className={classes.note}>
            Rates and durations computed over the most recent {data.sampled} of{' '}
            {data.runs} runs.
          </Typography>
        )}
      </>
    );
  }

  return <InfoCard title="Run statistics">{content}</InfoCard>;
}
