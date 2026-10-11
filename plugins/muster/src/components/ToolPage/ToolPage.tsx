import { ReactNode, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState } from '@backstage/core-components';
import { Alert, Flex, Link, Text } from '@backstage/ui';
import {
  BreadcrumbItem,
  Breadcrumbs,
  LoadingIndicator,
  ShellPage,
} from '@giantswarm/backstage-plugin-ui-react';
import { useAgentShell } from '../../hooks/useAgentShell';
import { customizeExternalRouteRef } from '../../routes';
import { findServerRow, serverRowKey } from '../../lib/serverGrouping';
import {
  serverPageResolver,
  serverPrefixInfos,
  shortToolName,
} from '../../lib/toolGrouping';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import {
  SessionGate,
  ToolMarkers,
  useServerPageLinks,
  useToolDescription,
} from '../shared';
import { ToolDetailPanel } from '../ToolDetail';
import { useServersListHref } from '../ServerPage';
import { useServerTools } from '../ServerPage/useServerPageData';

/** A muster tool name: one unbroken snake_case token, so it may break anywhere. */
const TOOL_NAME_STYLE = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
} as const;

/**
 * One tool's page, beneath the server offering it: its short and full name,
 * markers, description and input schema, and the typed argument form that runs
 * it, on a page of its own beneath the server. A family's
 * grouped tool asks for the family's instance argument like any other
 * required parameter.
 */
export function ToolPage() {
  const { server: key = '', tool = '' } = useParams();
  const agentShell = useAgentShell();
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const session = useMusterSession();
  const links = useServerPageLinks();
  const listHref = useServersListHref(activeInstallation);
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);
  const prefixes = useMemo(() => serverPrefixInfos(mcpServers), [mcpServers]);
  const shortName = shortToolName(tool, prefixes);
  const serverKey = row ? serverRowKey(row) : key;
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
  // The panel's request, so the markers beside the name cost nothing extra.
  const described = useToolDescription(tool, activeInstallation, {
    enabled: offered && session.authenticated,
  });
  const annotations = described.data?.annotations ?? listed?.annotations;

  const toolsHref = links.server(serverKey, activeInstallation);
  const crumbs: BreadcrumbItem[] = [
    { label: 'Connectors', href: listHref },
    { label: serverKey, href: toolsHref },
    { label: 'Tools', href: toolsHref },
    { label: shortName },
  ];

  let body: ReactNode;
  if (isLoadingInstallations || isLoading) {
    body = <LoadingIndicator label="Reading the environment's connectors…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyState
        missing="data"
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
    const serverHref = row
      ? links.server(serverKey, activeInstallation)
      : listHref;
    body = (
      <EmptyState
        missing="data"
        title={`No tool “${tool}” on ${activeInstallation}`}
        description={
          row
            ? 'It may have been removed, or run on another environment — pick it in the page header.'
            : `There is no connector “${key}” on ${activeInstallation}. It may run on another environment — pick it in the page header.`
        }
        action={
          serverHref ? (
            <Link href={serverHref}>
              {row
                ? `Back to the tools of ${serverKey}`
                : 'Back to the connectors'}
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <ToolDetailPanel
        // A fresh form per tool and installation: remembered arguments are
        // stored per installation, and a result must not outlive its tool.
        key={`${activeInstallation}/${tool}`}
        name={tool}
        installation={activeInstallation}
        showMarkers={false}
      />
    );
  }

  const exposedAs = (
    <>
      Exposed by muster as: <span style={TOOL_NAME_STYLE}>{tool}</span>
    </>
  );

  // In the shell, the platform's page frame like the connector's own page:
  // its phone gutters, an h1 that wraps, and the trail under Customize.
  if (agentShell) {
    const customize = customizeRoute?.();
    return (
      <ShellPage
        title={shortName}
        breadcrumbs={[
          { label: 'Customize', href: customize },
          {
            label: 'Connectors',
            href: customize ? `${customize}/connectors` : listHref,
          },
          ...crumbs.slice(1),
        ]}
        badges={<ToolMarkers annotations={annotations} />}
        meta={exposedAs}
      >
        {body}
      </ShellPage>
    );
  }

  return (
    <Content>
      <ActiveInstallationNote />
      <Flex direction="column" gap="4" style={{ maxWidth: 1024 }}>
        <Flex direction="column" gap="2">
          <Breadcrumbs items={crumbs} />
          <Text
            as="h2"
            variant="title-medium"
            style={{ overflowWrap: 'anywhere' }}
          >
            {shortName}
          </Text>
          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            <Text variant="body-small" color="secondary">
              {exposedAs}
            </Text>
            <ToolMarkers annotations={annotations} />
          </Flex>
        </Flex>
        {body}
      </Flex>
    </Content>
  );
}
