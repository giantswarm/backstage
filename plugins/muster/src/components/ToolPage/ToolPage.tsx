import { ReactNode, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Alert, Link } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
  ShellPage,
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
import { ToolRunPanel } from '../ToolDetail';
import {
  representativeServer,
  useServersListHref,
  useServerTools,
} from '../ServerPage/useServerPageData';
import { runsAsCaller } from '../ConnectorPage/connectorFacts';

/** A muster tool name: one unbroken snake_case token, so it may break anywhere. */
const TOOL_NAME_STYLE = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
} as const;

/**
 * One tool's page, beneath the server offering it: its short and full name,
 * what it does, description and input schema, and the typed argument form that runs
 * it, on a page of its own beneath the server. A family's
 * grouped tool asks for the family's instance argument like any other
 * required parameter.
 */
export function ToolPage() {
  const { server: key = '', tool = '' } = useParams();
  // The Tools search and filter the tool was opened from: the way back
  // keeps them.
  const params = new URLSearchParams(useLocation().search);
  const toolsView = {
    q: params.get('q') ?? undefined,
    effect: params.get('effect')?.split(',').filter(Boolean),
  };
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
  if (isLoadingInstallations || isLoading) {
    body = <LoadingIndicator label="Reading the environment's connectors…" />;
  } else if (!activeInstallation) {
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
    body = (
      <Alert
        status="danger"
        title="Could not read the connector's tools"
        description={serverTools.error.message}
      />
    );
  } else if (!row || !offered) {
    const serverHref = row ? toolsHref : listHref;
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
    body = (
      <ToolRunPanel
        name={tool}
        installation={activeInstallation}
        effect={toolEffect({ annotations })}
        asCaller={representative ? runsAsCaller(representative) : false}
      />
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
      badges={
        known ? <EffectBadge effect={toolEffect({ annotations })} /> : undefined
      }
      meta={exposedAs}
    >
      {body}
    </ShellPage>
  );
}
