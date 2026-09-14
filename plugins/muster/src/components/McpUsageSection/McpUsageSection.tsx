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
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  categoricalColors,
  columnMax,
  DataBar,
  SectionHeader,
  StackedBarChart,
} from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import type { McpUsage } from '../../apis';
import {
  isUnreachableSession,
  useMusterInstance,
  useMusterSession,
} from '../MusterInstanceProvider';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { MusterProviders } from '../MusterProviders';
import { SessionGate, Stat } from '../shared';

/**
 * The window, fixed at 30 days to match the personal section above it.
 *
 * There used to be a 24h/7d/30d switcher here, and it had to go when this moved
 * onto the shared Usage page. Three reasons. The kagent route backing the
 * section above takes no window parameter, so a control on this one alone would
 * make the page's stated window false for whichever section a reader just
 * switched. The two stop being comparable, which is the whole reason they share
 * a page. And the bucket size changes with the window (`formatBucketTick`
 * switches to hours below 24h), so a 24h selection put an hourly-bucketed chart
 * directly under a daily one — same idiom, different meaning per bar.
 *
 * What was lost is the 24h zoom, whose real question ("is muster dispatching
 * right now") the muster Dashboard already answers. Bringing a control back
 * means one *page-level* control driving both sections, once the kagent route
 * accepts a window.
 */
const WINDOW_HOURS = 30 * 24;

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
  /**
   * Stacked, not side by side.
   *
   * Two tables sharing a row each got half the width, which squeezed the tool
   * column that carries most of a row's meaning (`x_kubernetes_gazelle_…`
   * names wrap to three lines at 380px) and left the numeric columns too
   * narrow for a data bar to be worth reading. Full width also lines these up
   * with the tables on the other Usage tabs.
   */
  tables: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
  },
  tableCard: {
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  toolName: {
    // The body font, matching the personal section's tables directly above on
    // the Usage page — the same kind of value rendered two ways on one page
    // reads as a bug. `anywhere` rather than `break-all`, which split names
    // mid-word (`…resolve_cluste / r`) once the pitch stopped being fixed.
    overflowWrap: 'anywhere',
  },
  /**
   * Left-aligned, not right.
   *
   * These columns carry a `DataBar`, which grows from the left — a
   * right-aligned number over a left-anchored bar reads as two unrelated
   * things, and a mirrored bar read as inconsistent beside the left-aligned
   * tables on the Usage tab's other views. So the whole cell goes left and
   * matches them.
   */
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

  /**
   * The data bars' hues, one per measure.
   *
   * Slot numbers rather than an import: the agent-platform plugin keeps the
   * same measure→slot map for its own tables (`lib/measures.ts` — calls is
   * slot 0, a per-call figure slot 7), and matching it keeps "Calls" the same
   * colour across every table on the Usage tab. Importing that map would make
   * this plugin depend on agent-platform, which the whole attach-by-node-id
   * contract exists to avoid — so the two numbers are duplicated deliberately.
   * `barColors.test.ts` pins them, so drift fails CI rather than resting on
   * this comment. (`columnMax` was duplicated the same way and has since moved
   * to `ui-react`, which both plugins already depend on — the right home when
   * the shared thing has no domain content.)
   *
   * Errors takes the **status** red rather than a categorical slot: an error
   * count is a status quantity, and status colours are reserved. It ships with
   * a column header and its own figure, so it never rests on colour alone.
   */
  const palette = categoricalColors(theme);
  const barColors = {
    calls: palette[0],
    latency: palette[7],
    errors: errorColor,
  };

  // One maximum per column, so a bar is read against the column it sits in and
  // the two tables do not borrow each other's scale.
  const max = {
    toolCalls: columnMax(data.top_tools, row => row.calls),
    toolErrors: columnMax(data.top_tools, row => row.errors),
    toolP95: columnMax(data.top_tools, row => row.p95_seconds ?? undefined),
    serverCalls: columnMax(data.servers, row => row.calls),
    serverErrors: columnMax(data.servers, row => row.errors),
  };

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
                    <TableCell>Calls</TableCell>
                    <TableCell>Errors</TableCell>
                    <TableCell>p95</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.top_tools.map(row => (
                    <TableRow key={row.tool}>
                      <TableCell className={classes.toolName}>
                        {row.tool}
                      </TableCell>
                      <TableCell className={classes.numeric}>
                        <DataBar
                          label={formatCount(row.calls)}
                          value={row.calls}
                          max={max.toolCalls}
                          color={barColors.calls}
                        />
                      </TableCell>
                      <TableCell
                        className={`${classes.numeric} ${
                          row.errors > 0 ? classes.errorValue : ''
                        }`}
                      >
                        <DataBar
                          label={formatCount(row.errors)}
                          value={row.errors}
                          max={max.toolErrors}
                          color={barColors.errors}
                        />
                      </TableCell>
                      <TableCell className={classes.numeric}>
                        <DataBar
                          label={formatSeconds(row.p95_seconds)}
                          value={row.p95_seconds ?? undefined}
                          max={max.toolP95}
                          color={barColors.latency}
                        />
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
                    <TableCell>Calls</TableCell>
                    <TableCell>Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.servers.map(row => (
                    <TableRow key={row.server}>
                      <TableCell className={classes.toolName}>
                        {row.server}
                      </TableCell>
                      <TableCell className={classes.numeric}>
                        <DataBar
                          label={formatCount(row.calls)}
                          value={row.calls}
                          max={max.serverCalls}
                          color={barColors.calls}
                        />
                      </TableCell>
                      <TableCell
                        className={`${classes.numeric} ${
                          row.errors > 0 ? classes.errorValue : ''
                        }`}
                      >
                        <DataBar
                          label={formatCount(row.errors)}
                          value={row.errors}
                          max={max.serverErrors}
                          color={barColors.errors}
                        />
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
 * The installation-wide half of the Agent Platform's Usage tab: tool-call
 * volume, outcomes, latency and top tools/servers for the selected
 * installation, from muster's own Prometheus metrics via the muster-backend's
 * `/usage` route.
 *
 * Contributed to `sub-page:agent-platform/usage` (see `../../mcpUsageSection`)
 * rather than imported by that plugin, so neither plugin depends on the other.
 * It therefore brings its own `MusterProviders`: that stack is designed to be
 * mounted per view — the QueryClient is a module singleton and the active
 * installation lives in the URL plus localStorage — so mounting it here is a
 * cache read, not a refetch.
 *
 * **These numbers are every caller's**, not the reader's: muster's metrics carry
 * no user label. That is the whole reason the heading says so, and why this sits
 * below a section that is explicitly personal rather than merging into it.
 *
 * No installation picker: the Agent Platform page header already carries the
 * section's installation scope, and muster's picker wrote to that very same
 * store — so on this page it would have been a second control for one value.
 */
function McpUsageBody() {
  const classes = useStyles();
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
    <Box className={classes.column}>
      {/* ui-react's SectionHeader, not muster's own: this section sits beside a
          section of the host page, and the two headings have to look and rank
          identically. muster's variant carries an icon square and a different
          type scale, which is right on muster's own screens (where the page
          title is in the plugin header) and wrong here. `h3` also matters
          beyond looks — as a paragraph, this section's content was filed under
          the previous section's heading in the accessibility tree, so a screen
          reader heard installation-wide numbers as part of "Your agent
          usage". */}
      <SectionHeader
        as="h3"
        variant="title-x-small"
        title="MCP tool calls on this installation"
        description="Every tool call dispatched to the MCP servers behind this installation's muster, from all callers — not only yours. From muster's own metrics, over the last 30 days."
      />
      {/* Below the heading rather than above it, unlike muster's own views:
          there this note is page-level, here it explains which muster *this
          section* shows, so it belongs under the heading that names it. The
          personal section above carries the same note for its own read. */}
      <ActiveInstallationNote />
      {body}
    </Box>
  );
}

/** The section, self-contained so it can be mounted anywhere. */
export function McpUsageSection() {
  return (
    <MusterProviders>
      <McpUsageBody />
    </MusterProviders>
  );
}
