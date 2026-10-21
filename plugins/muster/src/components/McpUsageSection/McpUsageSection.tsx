import { makeStyles, Theme } from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { Box, Link, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  formatCount,
  formatSeconds,
  parseUsageWindowParam,
  USAGE_WINDOW_PARAM,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  SectionHeader,
  ShowMore,
  isAwaitingData,
} from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import { connectorNames } from '../../lib/connectorName';
import { connectorPageKey } from '../../lib/serverGrouping';
import type { MCPServer } from '../../lib/k8s';
import type { McpUsage } from '../../apis';
import {
  isUnreachableSession,
  useMusterInstance,
  useMusterSession,
} from '../MusterInstanceProvider';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { MusterProviders } from '../MusterProviders';
import {
  errorRatioFigure,
  McpCallsByOutcomeChart,
  McpDataStartNote,
  McpUsageTable,
  useUsageColumns,
} from '../McpUsage';
import { SessionGate, Stat, useServerPageLinks } from '../shared';

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
 * an hourly-bucketed chart under daily ones. The page's windows are whole
 * days, so the buckets stay daily.
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
  chart: {
    marginBottom: theme.spacing(3),
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
  note: {
    display: 'block',
    marginTop: theme.spacing(2),
  },
  dataStart: {
    display: 'block',
    marginBottom: theme.spacing(2),
  },
}));

type ToolRow = McpUsage['top_tools'][number] & { id: string };
type ServerRow = McpUsage['servers'][number] & { id: string };

function UsageBody({
  data,
  hours,
  installation,
  servers = [],
}: {
  data: McpUsage;
  hours: number;
  /** The installation the figures are read on, whose connector pages rows open. */
  installation: string;
  /**
   * The installation's MCPServer CRs, to name each connector as Customize
   * does and find the page that shows its usage.
   */
  servers?: MCPServer[];
}) {
  const classes = useStyles();
  const links = useServerPageLinks();
  const names = connectorNames(
    [
      ...(data.servers ?? []).map(entry => entry.server),
      ...(data.source?.server ? [data.source.server] : []),
    ],
    servers,
  );
  const toolRows: ToolRow[] = (data.top_tools ?? []).map(row => ({
    ...row,
    id: row.tool,
  }));
  const serverRows: ServerRow[] = (data.servers ?? []).map(row => ({
    ...row,
    id: row.server,
  }));
  const toolColumns = useUsageColumns(toolRows, {
    label: 'Top tools',
    renderName: row => row.tool,
    withP95: true,
  });
  const serverColumns = useUsageColumns(serverRows, {
    label: 'Connector',
    // To the connector's Usage tab: a family instance's is its family's,
    // which lists each instance. A row no page shows (muster's own tools, a
    // server since removed) stays plain text.
    renderName: row => {
      const name = names.get(row.server) ?? row.server;
      const key = connectorPageKey(servers, row.server);
      const href = key
        ? links.server(key, installation, { tab: 'usage' })
        : undefined;
      return href ? <Link href={href}>{name}</Link> : name;
    },
  });

  if (!data.available) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Usage metrics are not available for this environment:{' '}
        {data.reason ?? 'unknown reason'}
      </Text>
    );
  }

  const { totals } = data;
  const errorRatio = errorRatioFigure(totals.error_ratio);
  // One fixed window now, so the label is derived rather than looked up.
  const windowDays = Math.round(hours / 24);
  const rangeLabel = `${windowDays}d`;
  const windowNote = `over the last ${windowDays} days`;

  return (
    <>
      <McpDataStartNote
        usage={data}
        windowDays={windowDays}
        className={classes.dataStart}
      />
      <Box className={classes.statRow}>
        <Stat
          label="Tool calls"
          value={formatCount(totals.calls)}
          hint={`Counts calls dispatched to connectors ${windowNote}, from every client.`}
        />
        <Stat
          label="Error ratio"
          value={errorRatio.value}
          tone={errorRatio.tone}
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
          <div className={classes.chart}>
            <McpCallsByOutcomeChart
              buckets={data.buckets}
              stepHours={data.step_hours}
            />
          </div>

          <Box className={classes.tables}>
            <McpUsageTable rows={toolRows} columns={toolColumns} />

            {/* Sorted by calls on the server; the slice keeps the busiest. */}
            <ShowMore
              items={serverRows}
              initial={CONNECTOR_ROWS}
              noun="connector"
              revealAll
            >
              {visible => (
                <McpUsageTable rows={visible} columns={serverColumns} />
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
    body = (
      <UsageBody
        data={data}
        hours={hours}
        installation={activeInstallation}
        servers={mcpServers}
      />
    );
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
