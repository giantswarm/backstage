import { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import BarChartIcon from '@material-ui/icons/BarChart';
import { Content, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { StackedBarChart } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import type { McpUsage } from '../../apis';
import { useMusterInstance } from '../MusterInstanceProvider';
import { InstallationPicker } from '../InstallationPicker';
import { SectionHeader, Stat } from '../shared';

/** Selectable time windows; hours drives both the query and the bucket size. */
const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 7 * 24, label: '7d' },
  { hours: 30 * 24, label: '30d' },
] as const;

const useStyles = makeStyles((theme: Theme) => ({
  column: {
    maxWidth: 1024,
  },
  statRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2, 5),
    marginBottom: theme.spacing(3),
  },
  chartCard: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
    marginBottom: theme.spacing(3),
  },
  chartTitle: {
    marginBottom: theme.spacing(1.5),
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: 11,
    fontWeight: 500,
    color: theme.palette.text.secondary,
  },
  tables: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(3),
    alignItems: 'flex-start',
  },
  tableCard: {
    flex: '1 1 380px',
    minWidth: 0,
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  toolName: {
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all',
  },
  numeric: {
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  errorValue: {
    color: theme.palette.error.main,
  },
  note: {
    display: 'block',
    marginTop: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatSeconds(value: number | null): string {
  if (value === null) {
    return '—';
  }
  if (value < 1) {
    return `${Math.round(value * 1000)} ms`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} s`;
}

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

function UsageBody({ data, hours }: { data: McpUsage; hours: number }) {
  const classes = useStyles();
  const theme = useTheme();

  if (!data.available) {
    return (
      <Typography variant="body2" color="textSecondary">
        Usage metrics are not available for this installation:{' '}
        {data.reason ?? 'unknown reason'}
      </Typography>
    );
  }

  const { totals } = data;
  const errorPct =
    totals.error_ratio !== null ? Math.round(totals.error_ratio * 100) : null;
  let errorTone: 'ok' | 'warning' | undefined;
  if (errorPct !== null) {
    errorTone = errorPct <= 5 ? 'ok' : 'warning';
  }

  const okColor = theme.palette.success.main;
  const errorResultColor = theme.palette.warning.main;
  const errorColor = theme.palette.error.main;
  const rangeLabel =
    RANGES.find(range => range.hours === hours)?.label ?? `${hours}h`;

  return (
    <>
      <Box className={classes.statRow}>
        <Stat label="Tool calls" value={formatCount(totals.calls)} />
        <Stat
          label="Error ratio"
          value={errorPct !== null ? `${errorPct}%` : '—'}
          tone={errorTone}
        />
        <Stat label="p95 latency" value={formatSeconds(totals.p95_seconds)} />
        <Stat label="Distinct tools" value={totals.distinct_tools} />
      </Box>

      {totals.calls === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No tool calls were dispatched to MCP servers in the last {rangeLabel}.
          If usage on this installation is expected, its muster release may not
          export downstream dispatch metrics yet.
        </Typography>
      ) : (
        <>
          <Paper variant="outlined" className={classes.chartCard}>
            <Typography component="div" className={classes.chartTitle}>
              Tool calls by outcome
            </Typography>
            <StackedBarChart
              data={data.buckets}
              xAxisKey="start"
              series={[
                { dataKey: 'ok', name: 'ok', color: okColor },
                {
                  dataKey: 'error_result',
                  name: 'error result',
                  color: errorResultColor,
                },
                { dataKey: 'error', name: 'error', color: errorColor },
              ]}
              formatXAxisTick={start =>
                formatBucketTick(start, data.step_hours)
              }
              formatTooltipLabel={start =>
                formatBucketTooltip(start, data.step_hours)
              }
            />
          </Paper>

          <Box className={classes.tables}>
            <Paper variant="outlined" className={classes.tableCard}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Top tools</TableCell>
                    <TableCell align="right">Calls</TableCell>
                    <TableCell align="right">Errors</TableCell>
                    <TableCell align="right">p95</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.top_tools.map(row => (
                    <TableRow key={row.tool}>
                      <TableCell className={classes.toolName}>
                        {row.tool}
                      </TableCell>
                      <TableCell align="right" className={classes.numeric}>
                        {formatCount(row.calls)}
                      </TableCell>
                      <TableCell
                        align="right"
                        className={`${classes.numeric} ${
                          row.errors > 0 ? classes.errorValue : ''
                        }`}
                      >
                        {formatCount(row.errors)}
                      </TableCell>
                      <TableCell align="right" className={classes.numeric}>
                        {formatSeconds(row.p95_seconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Paper variant="outlined" className={classes.tableCard}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>MCP server</TableCell>
                    <TableCell align="right">Calls</TableCell>
                    <TableCell align="right">Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.servers.map(row => (
                    <TableRow key={row.server}>
                      <TableCell className={classes.toolName}>
                        {row.server}
                      </TableCell>
                      <TableCell align="right" className={classes.numeric}>
                        {formatCount(row.calls)}
                      </TableCell>
                      <TableCell
                        align="right"
                        className={`${classes.numeric} ${
                          row.errors > 0 ? classes.errorValue : ''
                        }`}
                      >
                        {formatCount(row.errors)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Box>
        </>
      )}

      {data.source && (
        <Typography variant="caption" className={classes.note}>
          Counted at muster's dispatch layer, so meta-tool wrapping (call_tool)
          is attributed to the resolved tool and server. Queried via{' '}
          {data.source.server}.
        </Typography>
      )}
    </>
  );
}

/**
 * The "MCP usage" view: tool-call volume, outcomes, latency, and top
 * tools/servers for the selected installation, derived from muster's own
 * Prometheus metrics by the muster-backend's `/usage` route.
 */
export function UsagePage() {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const { activeInstallation } = useMusterInstance();
  const [hours, setHours] = useState<number>(RANGES[0].hours);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'mcp-usage', activeInstallation, hours],
    queryFn: () =>
      musterApi.getMcpUsage({ installation: activeInstallation, hours }),
    enabled: Boolean(activeInstallation),
  });

  let body;
  if (!activeInstallation || isLoading) {
    body = <Progress />;
  } else if (error) {
    body = (
      <Typography variant="body2" color="textSecondary">
        Usage unavailable: {(error as Error).message}
      </Typography>
    );
  } else if (data) {
    body = <UsageBody data={data} hours={hours} />;
  }

  return (
    <Content>
      <InstallationPicker />
      <Box className={classes.column}>
        <SectionHeader
          icon={<BarChartIcon />}
          title="MCP usage"
          description="Tool calls dispatched to the MCP servers behind this muster, from muster's own metrics."
          action={
            <ButtonGroup size="small" aria-label="time range">
              {RANGES.map(range => (
                <Button
                  key={range.hours}
                  variant={range.hours === hours ? 'contained' : 'outlined'}
                  onClick={() => setHours(range.hours)}
                >
                  {range.label}
                </Button>
              ))}
            </ButtonGroup>
          }
        />
        {body}
      </Box>
    </Content>
  );
}
