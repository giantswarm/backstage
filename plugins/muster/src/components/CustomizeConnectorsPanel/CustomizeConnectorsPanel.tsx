import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  INITIAL_ROWS,
  LoadingIndicator,
  ShowMore,
  StatusDot,
  isAwaitingData,
  stopRowPress,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import type { ServerAuthStatus } from '../../apis/types';
import { serverListEntries, serverListRows } from '../../lib/serverList';
import type { ServerListEntry } from '../../lib/serverList';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import {
  authStatusQueryKey,
  ServerAuthActions,
  SessionGate,
  useServerPageLinks,
  useToolCatalogue,
} from '../shared';
import {
  authLabel,
  CONNECTOR_REACH_LABELS,
  CONNECTOR_REACH_ORDER,
  type ConnectorReach,
  connectorReach,
  connectorStatus,
  rowServer,
  toolsLabel,
} from './connectorRows';

const useStyles = makeStyles({
  tile: {
    flex: 'none',
    width: 36,
    height: 36,
    borderRadius: 9,
    border: '1px solid var(--bui-border-1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: 'var(--bui-fg-secondary)',
  },
});

export type CustomizeConnectorsPanelProps = {
  search: string;
};

type Row = {
  id: string;
  entry: ServerListEntry;
  description?: string;
  auth: string;
  tools?: string;
  authStatus?: ServerAuthStatus;
  signInServer?: string;
  reach?: ConnectorReach;
};

/**
 * The Connectors tab's facets (T49): how a person signs in, and whether the
 * connector answers now (with this person's sign-in).
 */
const CONNECTOR_FACETS: CatalogFacet<Row>[] = [
  { id: 'auth', label: 'Sign-in', value: row => row.auth || undefined },
  {
    id: 'reach',
    label: 'Connection',
    value: row => row.reach,
    optionLabel: value =>
      CONNECTOR_REACH_LABELS[value as ConnectorReach] ?? value,
    order: CONNECTOR_REACH_ORDER,
  },
];

function ConnectorName({ row }: { row: Row }) {
  const classes = useStyles();
  return (
    <Cell>
      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
        <span className={classes.tile} aria-hidden>
          {row.entry.id.charAt(0).toUpperCase()}
        </span>
        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          <Text variant="body-medium" weight="bold" truncate>
            {row.entry.id}
          </Text>
          {row.description && (
            <Text variant="body-small" color="secondary" truncate>
              {row.description}
            </Text>
          )}
        </Flex>
      </Flex>
    </Cell>
  );
}

function ConnectorStatusCell({
  row,
  installation,
}: {
  row: Row;
  installation: string;
}) {
  const status = connectorStatus(row.entry, row.authStatus);
  return (
    <Cell>
      <Flex align="center" justify="between" gap="2">
        <StatusDot tone={status.tone} label={status.label} />
        {row.signInServer && (
          // The row opens the connector; the sign-in must not.
          <span
            onPointerDown={stopRowPress}
            onPointerUp={stopRowPress}
            onClick={stopRowPress}
            onKeyDown={stopRowPress}
            role="presentation"
          >
            <ServerAuthActions
              noun="connector"
              serverName={row.signInServer}
              installation={installation}
            />
          </span>
        )}
      </Flex>
    </Cell>
  );
}

function ConnectorsTable({
  search,
  installation,
}: {
  search: string;
  installation: string;
}) {
  const { mcpServers, activeInstallationInfo } = useMusterInstance();
  const session = useMusterSession();
  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;
  const hasSession = session.authenticated || !requiresAuth;
  const links = useServerPageLinks();
  const musterApi = useApi(musterApiRef);

  const catalogue = useToolCatalogue(installation, hasSession);
  const authStatus = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: hasSession,
  });

  const listRows = useMemo(
    () =>
      serverListRows(mcpServers, catalogue.data?.tools ?? undefined).filter(
        row => row.row.kind !== 'core',
      ),
    [mcpServers, catalogue.data],
  );
  const toRow = useCallback(
    (entry: ServerListEntry): Row => {
      const server = rowServer(entry, installation);
      const status =
        entry.row.kind === 'server'
          ? authStatus.data?.servers.find(s => s.name === entry.id)
          : undefined;
      const asksSignIn =
        status?.status === 'auth_required' ||
        status?.status === 'reauth_required';
      const reach = connectorReach(entry, status);
      return {
        id: entry.key,
        entry,
        description: server?.getDescription(),
        auth: authLabel(server),
        tools: toolsLabel(entry),
        ...(status ? { authStatus: status } : {}),
        ...(asksSignIn && server?.canAuthenticateInteractively()
          ? { signInServer: entry.id }
          : {}),
        ...(reach ? { reach } : {}),
      };
    },
    [installation, authStatus.data],
  );
  // The whole list decides which filters can tell connectors apart; the
  // searched one is what they then narrow.
  const allRows = useMemo(
    () => serverListEntries(listRows, '').map(toRow),
    [listRows, toRow],
  );
  const searchedRows = useMemo(
    () =>
      search.trim() === ''
        ? allRows
        : serverListEntries(listRows, search).map(toRow),
    [allRows, listRows, search, toRow],
  );
  const filters = useCatalogFilters({
    items: allRows,
    searched: searchedRows,
    facets: CONNECTOR_FACETS,
  });
  const rows = filters.filtered;

  const columns: ColumnConfig<Row>[] = [
    {
      id: 'name',
      label: 'Connector',
      isRowHeader: true,
      defaultWidth: '3fr',
      cell: row => <ConnectorName row={row} />,
    },
    {
      id: 'auth',
      label: 'Sign-in',
      defaultWidth: '1.2fr',
      cell: row => <CellText title={row.auth} />,
    },
    {
      id: 'tools',
      label: 'Tools',
      defaultWidth: '1fr',
      cell: row => (
        <CellText title={row.tools ?? (isAwaitingData(catalogue) ? '…' : '')} />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      defaultWidth: '1.6fr',
      cell: row => (
        <ConnectorStatusCell row={row} installation={installation} />
      ),
    },
  ];

  let list;
  if (listRows.length === 0) {
    list = (
      <EmptyStateCard
        title="No connectors yet"
        description="Add a connector to give agents its tools."
      />
    );
  } else if (rows.length === 0) {
    list = (
      <CatalogNoMatch
        plural="connectors or tools"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else {
    // `serverListEntries` sorts by name, and ShowMore hands the table a page of
    // that at a time. Never bui's page mode, which draws its footer even at
    // three rows. Keyed on the search and filters, so a new query starts at
    // its first page.
    list = (
      <ShowMore
        key={`${search.trim()}|${filters.key}`}
        items={rows}
        initial={INITIAL_ROWS}
        noun="connector"
      >
        {page => (
          <Table<Row>
            columnConfig={columns}
            data={page}
            pagination={{ type: 'none' }}
            rowConfig={{
              getHref: row =>
                row.entry.shadowed
                  ? undefined
                  : links.server(row.entry.id, installation, {
                      q: row.entry.toolMatches ? search.trim() : undefined,
                    }),
            }}
          />
        )}
      </ShowMore>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
        onClear={filters.clear}
      />
      {!hasSession && (
        <SessionGate
          session={session}
          installation={installation}
          context="Tool counts and sign-ins need a muster session."
        />
      )}
      {catalogue.error && (
        <Alert
          status="danger"
          title="Could not read the connectors' tools"
          description={`${
            (catalogue.error as Error | null)?.message ?? 'No details.'
          } Tool counts are missing and the search covers connector names only.`}
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
      {list}
    </Flex>
  );
}

function Panel({ search }: CustomizeConnectorsPanelProps) {
  const { activeInstallation, isLoading } = useMusterInstance();

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading your connectors…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyStateCard
        title="No connectors here"
        description="None of your environments runs muster, which connects agents to tools."
      />
    );
  } else {
    body = (
      <ConnectorsTable search={search} installation={activeInstallation} />
    );
  }
  return (
    <Flex direction="column" gap="2">
      <ActiveInstallationNote />
      {body}
    </Flex>
  );
}

/**
 * The Connectors tab of the shell's Customize screen: the active muster's
 * servers as flat rows with how one signs in, their tool count and state, and
 * a sign-in where muster asks this person for one; filtered by sign-in and by
 * connection where those tell connectors apart (T49). Must be mounted inside a
 * `CustomizeMusterProvider`.
 */
export function CustomizeConnectorsPanel(props: CustomizeConnectorsPanelProps) {
  return (
    <QueryClientProvider>
      <Panel {...props} />
    </QueryClientProvider>
  );
}
