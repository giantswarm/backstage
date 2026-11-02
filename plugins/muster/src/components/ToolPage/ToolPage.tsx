import { ReactNode, useMemo } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Alert, Link } from '@backstage/ui';
import {
  parseUsageWindowParam,
  USAGE_WINDOW_PARAM,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  EmptyStateCard,
  LoadingIndicator,
  ShellPage,
  isAwaitingData,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  findServerRow,
  mcpServerDisplayNames,
  serverRowDisplayName,
  serverRowKey,
} from '../../lib/serverGrouping';
import { toolEffect } from '../../lib/toolAnnotations';
import {
  serverPageResolver,
  serverPrefixInfos,
  shortToolName,
} from '../../lib/toolGrouping';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import {
  EffectBadge,
  SessionGate,
  useServerPageLinks,
  useToolDescription,
  useConnectorGroupPaths,
} from '../shared';
import {
  ToolRunPanel,
  useRunLeaveGuard,
  useToolForm,
  useToolRun,
} from '../ToolDetail';
import {
  representativeServer,
  useServersListHref,
  useServerTools,
} from '../ServerPage/useServerPageData';
import { runsAsCaller } from '../ConnectorPage/connectorFacts';
import { ToolOverviewTab } from './ToolOverviewTab';
import { ToolUsageTab } from './ToolUsageTab';
import { toolPageTabs } from './toolTabs';

/** A muster tool name: one unbroken snake_case token, so it may break anywhere. */
const TOOL_NAME_STYLE = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
} as const;

/**
 * One tool's page, beneath the server offering it, with the header (its
 * short and full name, what it does) over three tabs, each its own address
 * under the page's, in the workflow page's order:
 *
 * - **Overview** (the index): what it is for, the connector that offers it,
 *   the name muster exposes it as, its annotations and its input schema,
 *   folded.
 * - **Run it** (`run`): the typed argument form that runs it, and the
 *   result. A family's grouped tool asks for the family's instance argument
 *   like any other required parameter.
 * - **Usage** (`usage`): its calls, errors and latency over the last 30
 *   days, read only while the tab is open.
 *
 * Any other address under the page's redirects to Overview, keeping its
 * query. The run and what is typed into its form live above the tabs, so a
 * look at the schema on Overview loses neither; while a run is in flight,
 * leaving the page asks first.
 */
export function ToolPage() {
  const { installation = '', server = '', tool = '' } = useParams();
  // Another tool, or the same name elsewhere, starts afresh: its own form,
  // no run in flight and no result.
  return <ToolPageContent key={`${installation}/${server}/${tool}`} />;
}

function ToolPageContent() {
  const { server: key = '', tool = '' } = useParams();
  const basePath = useSplatBasePath();
  // The address's own query, as it is: the tab links and the redirect keep
  // it. It carries the Tools search and filter the tool was opened from,
  // which the way back keeps.
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const toolsView = {
    q: params.get('q') ?? undefined,
    effect: params.get('effect')?.split(',').filter(Boolean),
  };
  // The Usage tab's window, as the connector's Usage tab linked here with it.
  const usageDays = parseUsageWindowParam(params.get(USAGE_WINDOW_PARAM));
  const paths = useConnectorGroupPaths();
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const session = useMusterSession();
  const links = useServerPageLinks();
  const listHref = useServersListHref(activeInstallation);
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);
  const prefixes = useMemo(() => serverPrefixInfos(mcpServers), [mcpServers]);
  const shortName = shortToolName(tool, prefixes);
  const serverKey = row ? serverRowKey(row) : key;
  const serverName = row
    ? serverRowDisplayName(row, mcpServerDisplayNames(mcpServers))
    : key;
  // The server's tools as muster lists them for this session: the tool is
  // shown only when its server offers it on this installation, not merely
  // when its name carries the server's prefix.
  const serverTools = useServerTools(
    row ?? { kind: 'core' },
    mcpServers,
    activeInstallation ?? '',
    {
      enabled: Boolean(row && activeInstallation) && session.authenticated,
    },
  );
  const pageOfTool = useMemo(
    () => serverPageResolver(mcpServers),
    [mcpServers],
  );
  // A truncated catalogue may stop short of the tool; then its prefix decides,
  // and describing it says whether muster has it.
  const listed = serverTools.tools?.find(t => t.name === tool);
  const offered =
    Boolean(listed) ||
    (serverTools.truncated && pageOfTool(tool) === serverKey);
  // The panel's request, so the badge beside the name costs nothing extra.
  const described = useToolDescription(tool, activeInstallation, {
    enabled: offered && session.authenticated,
  });
  const annotations = described.data?.annotations ?? listed?.annotations;
  // What it does, as the Tools list's row says it; only once the tool is
  // read, so an unread tool is not called one that changes things.
  const known = Boolean(described.data ?? listed);
  const effect = toolEffect({ annotations });

  // Without Usage for muster's own tools, which no metric counts.
  const tabs = toolPageTabs(key);
  const counted = tabs.some(tab => tab.id === 'usage');

  // The run and the form above the tabs: switching to Overview to read the
  // schema keeps what was typed, a run in flight and its result. A run's
  // result shows only on this page, so leaving it while one is in flight
  // asks first; the page's own tabs pass.
  const run = useToolRun(tool, activeInstallation);
  const form = useToolForm(tool, activeInstallation);
  const leaveGuard = useRunLeaveGuard(run.isPending, 'tool', {
    page: basePath,
  });

  // Without an installation there is no server to go back to: the page says
  // no environment runs muster.
  const toolsHref = activeInstallation
    ? links.server(serverKey, activeInstallation, toolsView)
    : undefined;
  const representative =
    row && activeInstallation
      ? representativeServer(row, activeInstallation)?.server
      : undefined;
  let body: ReactNode;
  // The tab strip while the page can still turn out to be the tool's, and
  // once it is; never on a page that says there is no such tool.
  let withTabs = true;
  if (isLoadingInstallations || isLoading) {
    body = <LoadingIndicator label="Reading the environment's connectors…" />;
  } else if (!activeInstallation) {
    withTabs = false;
    body = (
      <EmptyStateCard
        title="No muster environment"
        description="None of this portal's environments runs muster."
      />
    );
  } else if (row && !session.authenticated) {
    body = (
      <SessionGate
        session={session}
        installation={activeInstallation}
        context="Tools need a muster session."
      />
    );
  } else if (row && serverTools.isLoading) {
    body = <LoadingIndicator label="Reading the connector's tools…" />;
  } else if (row && serverTools.error) {
    withTabs = false;
    body = (
      <Alert
        status="danger"
        title="Could not read the connector's tools"
        description={serverTools.error.message}
      />
    );
  } else if (!row || !offered) {
    const serverHref = row ? toolsHref : listHref;
    withTabs = false;
    body = (
      <EmptyStateCard
        title={`No tool “${tool}” on ${activeInstallation}`}
        description={
          row
            ? 'It may have been removed, or run on another environment — pick it in the page header.'
            : `There is no connector “${key}” on ${activeInstallation}. It may run on another environment — pick it in the page header.`
        }
        actions={
          serverHref ? (
            <Link href={serverHref}>
              {row
                ? `Back to the tools of ${serverName}`
                : 'Back to connectors'}
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    const installation = activeInstallation;
    body = (
      <Routes>
        <Route
          index
          element={
            <ToolOverviewTab
              name={tool}
              installation={installation}
              detail={described.data}
              isLoading={isAwaitingData(described)}
              error={described.error ?? undefined}
              annotations={annotations}
              connectorName={serverName}
              connectorHref={toolsHref}
            />
          }
        />
        <Route
          path="run"
          element={
            <ToolRunPanel
              name={tool}
              installation={installation}
              effect={effect}
              asCaller={representative ? runsAsCaller(representative) : false}
              run={run}
              form={form}
            />
          }
        />
        {counted && (
          <Route
            path="usage"
            element={
              <ToolUsageTab
                name={tool}
                row={row}
                installation={installation}
                days={usageDays}
                connectorName={serverName}
                connectorUsageHref={links.server(serverKey, installation, {
                  tab: 'usage',
                  usageWindow: usageDays,
                })}
              />
            }
          />
        )}
        {/* An address the page does not have lands on Overview. */}
        <Route
          path="*"
          element={<Navigate to={`${basePath}${search}`} replace />}
        />
      </Routes>
    );
  }

  const exposedAs = (
    <>
      Exposed by muster as: <span style={TOOL_NAME_STYLE}>{tool}</span>
    </>
  );

  // The platform's page frame like the connector's own page: its phone
  // gutters, an h1 that wraps, and the trail under Customize.
  return (
    <ShellPage
      title={shortName}
      breadcrumbs={[
        { label: 'Customize', href: paths.customize },
        {
          label: 'Connectors',
          // The sub-tab that lists the tool's connector.
          href: paths.customize ? paths.listOf(key, row) : listHref,
        },
        // No "Tools" crumb: Tools is the connector page's index, so it
        // would repeat the connector's own link.
        { label: serverName, href: toolsHref },
        { label: shortName },
      ]}
      badges={known ? <EffectBadge effect={effect} /> : undefined}
      meta={exposedAs}
      tabs={withTabs ? tabs : undefined}
      tabsSearch={search}
    >
      {body}
      {leaveGuard.dialog}
    </ShellPage>
  );
}
