import { ReactNode, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Content, EmptyState } from '@backstage/core-components';
import { Flex, Link, Text } from '@backstage/ui';
import {
  Breadcrumbs,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  ServerPageRow,
  findServerRow,
  serverRowKey,
} from '../../lib/serverGrouping';
import {
  serverPrefixInfos,
  shortToolName,
  toolsForRow,
} from '../../lib/toolGrouping';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { SessionGate, useServerPageLinks } from '../shared';
import { ToolDetailPanel } from '../ToolDetail';
import { useServersListHref } from '../ServerPage';

/**
 * Whether `tool` is one of the row's by its name alone -- the check that keeps
 * a tool page from rendering a tool under a server that does not offer it.
 */
function belongsTo(
  tool: string,
  row: ServerPageRow,
  prefixes: ReturnType<typeof serverPrefixInfos>,
) {
  return toolsForRow([{ name: tool }], row, prefixes).length > 0;
}

/**
 * One tool's page, beneath the server offering it: its short and full name,
 * markers, description and input schema, and the typed argument form that runs
 * it -- the Tool explorer's detail panel, on a page of its own. A family's
 * grouped tool asks for the family's instance argument like any other
 * required parameter.
 */
export function ToolPage() {
  const { server: key = '', tool = '' } = useParams();
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const session = useMusterSession();
  const links = useServerPageLinks();
  const listHref = useServersListHref(activeInstallation);
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);
  const prefixes = useMemo(() => serverPrefixInfos(mcpServers), [mcpServers]);
  const shortName = shortToolName(tool, prefixes);
  const serverKey = row ? serverRowKey(row) : key;

  const trail = (
    <Breadcrumbs
      items={[
        { label: 'MCP Servers', href: listHref },
        { label: serverKey, href: links.server(serverKey, activeInstallation) },
        {
          label: 'Tools',
          href: links.server(serverKey, activeInstallation, { tab: 'tools' }),
        },
        { label: shortName },
      ]}
    />
  );

  let body: ReactNode;
  if (isLoadingInstallations || isLoading) {
    body = <LoadingIndicator label="Reading the installation's MCP servers…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyState
        missing="data"
        title="No muster installation"
        description="None of the installations this portal knows runs muster, so there are no aggregated tools to show."
      />
    );
  } else if (!row || !belongsTo(tool, row, prefixes)) {
    const serverHref = row
      ? links.server(serverKey, activeInstallation, { tab: 'tools' })
      : listHref;
    body = (
      <EmptyState
        missing="data"
        title={`No tool “${tool}” on ${activeInstallation}`}
        description={
          row
            ? `${serverKey} on ${activeInstallation} does not offer a tool named “${tool}”.`
            : `The installation ${activeInstallation} has no MCP server or server family named “${key}”. It may run on another installation — pick it in the page header.`
        }
        action={
          serverHref ? (
            <Link href={serverHref}>
              {row
                ? `Back to the tools of ${serverKey}`
                : 'Back to the MCP servers'}
            </Link>
          ) : undefined
        }
      />
    );
  } else if (!session.authenticated) {
    body = (
      <SessionGate
        session={session}
        installation={activeInstallation}
        context="A tool is described and run through the muster session."
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
        showName={false}
      />
    );
  }

  return (
    <Content>
      <ActiveInstallationNote />
      <Flex direction="column" gap="4" style={{ maxWidth: 1024 }}>
        <Flex direction="column" gap="2">
          {trail}
          <Text as="h2" variant="title-medium">
            {shortName}
          </Text>
          <Text
            variant="body-small"
            color="secondary"
            style={{ fontFamily: 'monospace' }}
          >
            {tool}
          </Text>
        </Flex>
        {body}
      </Flex>
    </Content>
  );
}
