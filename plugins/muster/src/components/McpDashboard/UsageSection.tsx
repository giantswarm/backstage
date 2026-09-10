import {
  Box,
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
import BarChart from '@material-ui/icons/BarChart';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { StackedBarChart } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import type { McpUsage } from '../../apis';
import {
  isUnreachableSession,
  useMusterInstance,
  useMusterSession,
} from '../MusterInstanceProvider';
import { SectionHeader, SessionGate, Stat } from '../shared';

/**
 * The window, fixed at 30 days to match the Agents dashboard's.
 *
 * There used to be a 24h/7d/30d switcher here, and it went when this section
 * moved under the Agent Platform's Dashboards tab. Two reasons still hold. The
 * kagent route behind the Agents dashboard takes no window parameter, so a
 * control on this dashboard alone would leave the two reporting different
 * windows with only one of them saying so — and the whole point of putting them
 * one tab apart is that they can be compared. And the bucket size changes with
 * the window (`formatBucketTick` switches to hours below 24h), so a 24h
 * selection drew hourly bars in a chart a reader had just read as daily.
 *
 * What was lost is the 24h zoom, whose real question ("is muster dispatching
 * right now") the inventory and health above answer. Bringing a control back
 * means one *tab-level* control driving both dashboards, once the kagent route
 * accepts a window.
 */
const WINDOW_HOURS = 30 * 24;

const useStyles = makeStyles((theme: Theme) => ({
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
    // The body font, matching the tables on the Agents dashboard — the same
    // kind of value rendered two ways one tab apart reads as a bug. `anywhere`
    // rather than `break-all`, which split names mid-word
    // (`…resolve_cluste / r`) once the pitch stopped being fixed.
    overflowWrap: 'anywhere',
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
  // One fixed window now, so the label is derived rather than looked up.
  const rangeLabel = `${Math.round(hours / 24)}d`;

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
 * The tool-call section of the MCP dashboard: volume, outcomes, latency and top
 * tools/servers for the selected installation, from muster's own Prometheus
 * metrics via the muster-backend's `/usage` route.
 *
 * **These numbers are every caller's**, not the reader's: muster's metrics carry
 * no user label. The description says so, which is what keeps them from being
 * read as the personal totals the Agents dashboard one tab over reports.
 *
 * No installation picker and no `ActiveInstallationNote` of its own: the Agent
 * Platform page header carries the section's installation scope, and the
 * dashboard around this states which muster it is reading once, at the top.
 */
export function UsageSection() {
  const musterApi = useApi(musterApiRef);
  const { activeInstallation } = useMusterInstance();
  // The usage route reads muster's own metrics through the live session; an
  // installation whose muster the backend cannot reach gets the note instead
  // of a request that can only fail.
  const session = useMusterSession();
  const unreachable = isUnreachableSession(session);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'mcp-usage', activeInstallation, WINDOW_HOURS],
    queryFn: () =>
      musterApi.getMcpUsage({
        installation: activeInstallation,
        hours: WINDOW_HOURS,
      }),
    enabled: Boolean(activeInstallation) && !unreachable,
  });

  let body;
  if (unreachable) {
    body = (
      <SessionGate
        session={session}
        installation={activeInstallation}
        context="Usage metrics are read through a live muster session."
      />
    );
  } else if (!activeInstallation || isLoading) {
    body = <Progress />;
  } else if (error) {
    body = (
      <Typography variant="body2" color="textSecondary">
        Usage unavailable: {(error as Error).message}
      </Typography>
    );
  } else if (data) {
    body = <UsageBody data={data} hours={WINDOW_HOURS} />;
  }

  return (
    <Box>
      {/* muster's own SectionHeader, so this section carries the same icon
          square and rhythm as the ones around it. `as="h3"` because this
          dashboard *does* have a heading tree (the `h2` at the top of
          McpDashboard) — as a paragraph, this section's content was filed
          under the preceding section's heading in the accessibility tree. */}
      <SectionHeader
        as="h3"
        icon={<BarChart />}
        title="Tool calls"
        description="Every tool call dispatched to the MCP servers behind this installation's muster, from all callers — not only yours. From muster's own metrics, over the last 30 days."
      />
      {body}
    </Box>
  );
}
