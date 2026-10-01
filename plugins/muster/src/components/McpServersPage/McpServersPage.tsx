import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddIcon from '@material-ui/icons/Add';
import { Content, EmptyState } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, SearchField, Text } from '@backstage/ui';
import {
  LoadingIndicator,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';
import { newMcpServerRouteRef } from '../../routes';
import { MUSTER_SERVER_KEY } from '../../lib/serverGrouping';
import { serverListEntries, serverListRows } from '../../lib/serverList';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { Gate, useServerPageLinks, useToolCatalogue } from '../shared';
import { MusterSummary } from './MusterSummary';
import { CatalogueState, ServersTable } from './ServersTable';

/** What a search with no result says, given what could be searched. */
function emptyText(catalogue: CatalogueState, query: string): string {
  switch (catalogue) {
    case 'loaded':
      return `No server or tool matches “${query}”.`;
    case 'failed':
      return `No server name matches “${query}”. Tool names could not be searched: the installation's tools failed to load.`;
    case 'loading':
      return `No server name matches “${query}”. The installation's tools are still loading.`;
    default:
      return `No server name matches “${query}”. Tool names are searched once connected to muster.`;
  }
}

/**
 * The MCP servers of the active installation as one flat table -- a server
 * family is one row, a singular server one row, muster's own tools one row --
 * each opening its server page. The search matches server names and, through
 * the installation's tool catalogue, tool names: it narrows the servers and
 * never lists tools of several servers together, since a tool is always
 * picked inside the server offering it.
 */
export function McpServersPage() {
  const { mcpServers, activeInstallation, activeInstallationInfo, isLoading } =
    useMusterInstance();
  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;
  // Session state (and the connect action) are resolved once via the shared
  // hook so the servers list, a server page and the workflows page agree (ADR D3).
  const { authenticated, connecting, connect } = useMusterSession();
  const links = useServerPageLinks();

  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const setQuery = (next: string) =>
    setSearchParams(
      prev => {
        if (next) {
          prev.set('q', next);
        } else {
          prev.delete('q');
        }
        return prev;
      },
      { replace: true },
    );

  const catalogue = useToolCatalogue(activeInstallation, authenticated);
  // Each tool attributed to its row once per catalogue read; a keystroke in
  // the search only filters.
  const listRows = useMemo(
    () => serverListRows(mcpServers, catalogue.data?.tools ?? undefined),
    [mcpServers, catalogue.data],
  );
  const entries = useMemo(
    () => serverListEntries(listRows, query),
    [listRows, query],
  );
  let catalogueState: CatalogueState = 'unavailable';
  if (catalogue.data) {
    catalogueState = 'loaded';
  } else if (catalogue.isLoading) {
    catalogueState = 'loading';
  } else if (catalogue.error) {
    catalogueState = 'failed';
  }

  // "Register server" in the shared Agent Platform page header (agent-flow
  // convention) — the one path for bringing a remote MCP server onto the
  // platform.
  const navigate = useNavigate();
  const newServerLink = useRouteRef(newMcpServerRouteRef);
  // The wizard state outlives the wizard, so an unfinished registration draft
  // is still there on the next visit. An edit (or a saved registration) is not
  // a draft: registering a new server starts from an empty form.
  const { registeredName, reset } = useNewMcpServerForm();
  const headerActions = useMemo(
    () => (
      <Button
        variant="primary"
        iconStart={<AddIcon fontSize="inherit" />}
        onPress={() => {
          if (registeredName) {
            reset();
          }
          if (newServerLink) {
            navigate(newServerLink());
          }
        }}
      >
        Register server
      </Button>
    ),
    [newServerLink, navigate, registeredName, reset],
  );
  useProvidePageHeaderActions(headerActions);

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading the installation's MCP servers…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyState
        missing="data"
        title="No muster installation"
        description="None of the installations this portal knows runs muster, so there are no aggregated MCP servers to list."
      />
    );
  } else if (mcpServers.length === 0) {
    // The endpoint still leads: muster serves its core tools without any
    // aggregated server behind it.
    const musterHref = links.server(MUSTER_SERVER_KEY, activeInstallation);
    body = (
      <Flex direction="column" gap="3" style={{ maxWidth: 1024 }}>
        <MusterSummary servers={mcpServers} />
        <EmptyState
          missing="data"
          title="No MCP servers"
          description="No MCPServer CRs found in this installation. The muster CRDs may not be installed, or the aggregator federates none yet."
          action={
            musterHref ? (
              <Link href={musterHref}>Open muster's own tools</Link>
            ) : undefined
          }
        />
      </Flex>
    );
  } else {
    const trimmed = query.trim();
    body = (
      <Flex direction="column" gap="3">
        <MusterSummary servers={mcpServers} />
        {requiresAuth && !authenticated && (
          <Gate
            label="The servers are read from the CRDs, but their tools -- and searching by tool name -- need an authenticated muster session."
            action={
              <Button
                variant="primary"
                size="small"
                isPending={connecting}
                onPress={() => connect()}
              >
                Connect to muster
              </Button>
            }
          />
        )}
        {/* No refresh control: the servers are re-read every 30 s, as the
            Agent Platform's other tables re-read theirs. */}
        <SearchField
          aria-label="Search servers and tools"
          placeholder="Search servers and tools"
          value={query}
          onChange={setQuery}
          style={{ maxWidth: 480 }}
        />
        {catalogueState === 'failed' && (
          <Alert
            status="danger"
            title="Could not read the installation's tools"
            description={`${
              (catalogue.error as Error | null)?.message ?? 'No details.'
            } Tool counts are missing and the search covers server names only.`}
            customActions={
              <Button
                size="small"
                variant="secondary"
                onPress={() => catalogue.refetch()}
              >
                Retry
              </Button>
            }
          />
        )}
        {catalogue.data?.truncated && (
          <Text as="p" variant="body-small" color="secondary">
            The installation offers more tools than one request returns; tool
            counts and matches may be incomplete.
          </Text>
        )}
        <ServersTable
          entries={entries}
          installation={activeInstallation}
          query={query}
          catalogue={catalogueState}
          emptyText={emptyText(catalogueState, trimmed)}
        />
      </Flex>
    );
  }

  return (
    <Content>
      <ActiveInstallationNote />
      {body}
    </Content>
  );
}
