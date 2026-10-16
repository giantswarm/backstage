import { Paper, makeStyles, useTheme, Theme } from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { Box, Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  formatCount,
  formatSeconds,
  formatDayWithYear,
  parseUsageWindowParam,
  usageDataStart,
  USAGE_WINDOW_PARAM,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  categoricalColors,
  columnMax,
  DataBar,
  SectionHeader,
  ShowMore,
  StackedBarChart,
  isAwaitingData,
  usePhoneColumns,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import { connectorNames } from '../../lib/connectorName';
import type { MCPServer } from '../../lib/k8s';
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
 * The window: the Usage screen's own time-range control (`?window=7d`, the
 * 7 | 30 | 90 days every view of the screen reads), never a control of this
 * section's. muster's `/usage` takes any span up to 90 days, so the figures
 * follow the selection like the gateway views beside them (QA round 1: the
 * control showed here and changed nothing).
 *
 * There used to be a 24h/7d/30d switcher on the section itself, and it went
 * when this moved onto the shared Usage page: a control on one section would
 * make the page's stated window false for the others, and a 24h selection put
 * an hourly-bucketed chart (`formatBucketTick`) under daily ones. The page's
 * windows are whole days, so the buckets stay daily.
 */
function useWindowHours(): number {
  const [searchParams] = useSearchParams();
  return parseUsageWindowParam(searchParams.get(USAGE_WINDOW_PARAM)) * 24;
}

/**
 * How many connectors the table shows before *Show all N connectors*.
 *
 * The backend sends every connector with a call in the window — no top-N, as
 * it does for tools — so a large gateway's list is unbounded. Realistically
 * tens, so one click reveals the rest rather than paging through them.
 */
export const CONNECTOR_ROWS = 15;

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
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
    // Scrolls inside the card if a row still does not fit, rather than being
    // clipped by it (T22 C19); the radius clips the same either way.
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  /** The figures a phone's table has no column for, under the name. */
  phoneFacts: {
    display: 'block',
    marginTop: 2,
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
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
  },
  dataStart: {
    display: 'block',
    marginBottom: theme.spacing(2),
  },
}));

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

/**
 * At phone width, a row's errors and p95 in words under its name: the table
 * keeps the name and Calls there (T22 C19), and a hidden column's value still
 * has to be on the row.
 */
function PhoneFacts({
  errors,
  p95Seconds,
  className,
  errorClassName,
}: {
  errors: number;
  p95Seconds?: number | null;
  className: string;
  errorClassName: string;
}) {
  return (
    <span className={className}>
      <span className={errors > 0 ? errorClassName : undefined}>
        {formatCount(errors)} {errors === 1 ? 'error' : 'errors'}
      </span>
      {p95Seconds !== undefined && <> · p95 {formatSeconds(p95Seconds)}</>}
    </span>
  );
}

/** Name and Calls at phone width; every column elsewhere. */
const PHONE_COLUMNS = ['name', 'calls'];

/**
 * One of the section's ranked tables: a bui `Table` like the other usage
 * tables on the page, in the order the route sends (busiest first), unsorted
 * and unpaged — the connectors are revealed by `ShowMore` around it.
 */
function UsageTable<T extends { id: string }>({
  rows,
  columns,
}: {
  rows: T[];
  columns: ColumnConfig<T>[];
}) {
  const shown = usePhoneColumns(columns, PHONE_COLUMNS);
  const { tableProps } = useTable<T>({
    mode: 'complete',
    data: rows,
    paginationOptions: { type: 'none' },
  });
  return <Table<T> {...tableProps} data={rows} columnConfig={shown} />;
}

function UsageBody({
  data,
  hours,
  servers = [],
}: {
  data: McpUsage;
  hours: number;
  /** The installation's MCPServer CRs, to name each connector as Customize does. */
  servers?: MCPServer[];
}) {
  const classes = useStyles();
  const theme = useTheme();
  const isPhone = usePhoneLayout();
  const names = connectorNames(
    [
      ...(data.servers ?? []).map(entry => entry.server),
      ...(data.source?.server ? [data.source.server] : []),
    ],
    servers,
  );

  if (!data.available) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Usage metrics are not available for this environment:{' '}
        {data.reason ?? 'unknown reason'}
      </Text>
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
  const windowDays = Math.round(hours / 24);
  const rangeLabel = `${windowDays}d`;
  const windowNote = `over the last ${windowDays} days`;
  // Where muster's records start, when that is after the window does and it
  // recorded nothing in the week before: the figures then cover fewer days
  // than the window names. Worded as what was recorded, because a restart
  // followed by a quiet spell looks the same. Daily buckets only, which is all
  // the Usage screen asks for.
  const dataStart =
    data.step_hours >= 24
      ? usageDataStart(
          data.buckets.map(bucket => bucket.start.slice(0, 10)),
          data.data_start?.slice(0, 10),
        )
      : undefined;

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

  type ToolRow = McpUsage['top_tools'][number] & { id: string };
  type ServerRow = NonNullable<McpUsage['servers']>[number] & { id: string };
  const toolRows: ToolRow[] = data.top_tools.map(row => ({
    ...row,
    id: row.tool,
  }));
  const serverRows: ServerRow[] = (data.servers ?? []).map(row => ({
    ...row,
    id: row.server,
  }));

  const errorsCell = (errors: number, maxErrors: number | undefined) => (
    <Cell>
      <span
        className={`${classes.numeric} ${errors > 0 ? classes.errorValue : ''}`}
      >
        <DataBar
          label={formatCount(errors)}
          value={errors}
          max={maxErrors ?? errors}
          color={barColors.errors}
        />
      </span>
    </Cell>
  );

  // At phone width each table keeps the name and Calls; Errors and p95 move
  // under the name, as words (`PhoneFacts`).
  const toolColumns: ColumnConfig<ToolRow>[] = [
    {
      id: 'name',
      label: 'Top tools',
      isRowHeader: true,
      cell: row => (
        <Cell>
          <span className={classes.toolName}>
            {row.tool}
            {isPhone && (
              <PhoneFacts
                errors={row.errors}
                p95Seconds={row.p95_seconds}
                className={classes.phoneFacts}
                errorClassName={classes.errorValue}
              />
            )}
          </span>
        </Cell>
      ),
    },
    {
      id: 'calls',
      label: 'Calls',
      cell: row => (
        <Cell>
          <span className={classes.numeric}>
            <DataBar
              label={formatCount(row.calls)}
              value={row.calls}
              max={max.toolCalls}
              color={barColors.calls}
            />
          </span>
        </Cell>
      ),
    },
    {
      id: 'errors',
      label: 'Errors',
      cell: row => errorsCell(row.errors, max.toolErrors),
    },
    {
      id: 'p95',
      label: 'p95',
      cell: row => (
        <Cell>
          <span className={classes.numeric}>
            <DataBar
              label={formatSeconds(row.p95_seconds)}
              value={row.p95_seconds ?? undefined}
              max={max.toolP95}
              color={barColors.latency}
            />
          </span>
        </Cell>
      ),
    },
  ];
  const serverColumns: ColumnConfig<ServerRow>[] = [
    {
      id: 'name',
      label: 'Connector',
      isRowHeader: true,
      cell: row => (
        <Cell>
          <span className={classes.toolName}>
            {names.get(row.server) ?? row.server}
            {isPhone && (
              <PhoneFacts
                errors={row.errors}
                className={classes.phoneFacts}
                errorClassName={classes.errorValue}
              />
            )}
          </span>
        </Cell>
      ),
    },
    {
      id: 'calls',
      label: 'Calls',
      cell: row => (
        <Cell>
          <span className={classes.numeric}>
            <DataBar
              label={formatCount(row.calls)}
              value={row.calls}
              max={max.serverCalls}
              color={barColors.calls}
            />
          </span>
        </Cell>
      ),
    },
    {
      id: 'errors',
      label: 'Errors',
      cell: row => errorsCell(row.errors, max.serverErrors),
    },
  ];

  return (
    <>
      {dataStart && (
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.dataStart}
        >
          Tool calls have been recorded only since{' '}
          {formatDayWithYear(dataStart.day)}, so these figures cover{' '}
          {dataStart.coveredDays} of the {windowDays} days.
        </Text>
      )}
      <Box className={classes.statRow}>
        <Stat
          label="Tool calls"
          value={formatCount(totals.calls)}
          hint={`Counts calls dispatched to connectors ${windowNote}, from every client.`}
        />
        <Stat
          label="Error ratio"
          value={errorPct !== null ? `${errorPct}%` : '—'}
          tone={errorTone}
          hint="Shows the share of calls that failed to dispatch or returned an error. Amber above 5%."
        />
        <Stat
          label="p95 latency"
          value={formatSeconds(totals.p95_seconds)}
          hint={`Shows the 95th-percentile connector response time ${windowNote}. It is estimated from a histogram, so read it as a range.`}
        />
        <Stat
          label="Distinct tools"
          value={totals.distinct_tools}
          hint={`Counts the tools called at least once ${windowNote}.`}
        />
      </Box>

      {totals.calls === 0 ? (
        <Text as="p" variant="body-medium" color="secondary">
          No tool calls were dispatched to connectors in the last {rangeLabel}.
          If usage is expected, this environment's muster may not export
          dispatch metrics yet.
        </Text>
      ) : (
        <>
          <Paper variant="outlined" className={classes.chartCard}>
            <div className={classes.chartTitle}>Tool calls by outcome</div>
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
              formatValue={formatCount}
              formatYAxisTick={formatCount}
              yAxisWidth={56}
              height={200}
              showLegend
            />
          </Paper>

          <Box className={classes.tables}>
            <Paper variant="outlined" className={classes.tableCard}>
              <UsageTable rows={toolRows} columns={toolColumns} />
            </Paper>

            {/* Sorted by calls on the server; the slice keeps the busiest. */}
            <ShowMore
              items={serverRows}
              initial={CONNECTOR_ROWS}
              noun="connector"
              revealAll
            >
              {visible => (
                <Paper variant="outlined" className={classes.tableCard}>
                  <UsageTable rows={visible} columns={serverColumns} />
                </Paper>
              )}
            </ShowMore>
          </Box>
        </>
      )}

      {data.source && (
        <Text
          as="p"
          variant="body-x-small"
          color="secondary"
          className={classes.note}
        >
          Counted at muster's dispatch layer, so meta-tool wrapping (call_tool)
          is attributed to the resolved tool and connector. Queried through the{' '}
          {names.get(data.source.server) ?? data.source.server} connector.
        </Text>
      )}
    </>
  );
}

/**
 * The installation-wide half of the Agent Platform's Usage page: tool-call
 * volume, outcomes, latency and top tools/servers for the selected
 * installation, from muster's own Prometheus metrics via the muster-backend's
 * `/usage` route.
 *
 * Contributed to `page:agent-platform/usage` (see `../../mcpUsageSection`)
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
  const { activeInstallation, mcpServers } = useMusterInstance();
  // The usage route reads muster's own metrics through the live session; an
  // installation whose muster the backend cannot reach gets the note instead
  // of a request that can only fail.
  const session = useMusterSession();
  const unreachable = isUnreachableSession(session);
  const hours = useWindowHours();

  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: ['muster', 'mcp-usage', activeInstallation, hours],
    queryFn: () =>
      musterApi.getMcpUsage({
        installation: activeInstallation,
        hours,
      }),
    enabled: Boolean(activeInstallation) && !unreachable,
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  let body;
  if (unreachable) {
    body = (
      <SessionGate
        session={session}
        installation={activeInstallation}
        context="Usage metrics need a muster session."
      />
    );
  } else if (!activeInstallation || isLoading) {
    body = <Progress />;
  } else if (error) {
    body = (
      <Text as="p" variant="body-medium" color="secondary">
        Usage unavailable: {(error as Error).message}
      </Text>
    );
  } else if (data) {
    body = <UsageBody data={data} hours={hours} servers={mcpServers} />;
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
        title="Connector tool calls on this environment"
        description={`This covers every caller's tool calls, not only yours, over the last ${Math.round(
          hours / 24,
        )} days.`}
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
