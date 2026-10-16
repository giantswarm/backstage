import { Fragment, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Link,
  Table,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  applyCatalogFilters,
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  countNoun,
  EmptyStateCard,
  INITIAL_ROWS,
  LoadingIndicator,
  ShowMore,
  StackedRow,
  type StackedRowItem,
  StackedRowList,
  StatusDot,
  isAwaitingData,
  stopRowPress,
  useCatalogFilters,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { serverListEntries, serverListRows } from '../../lib/serverList';
import type { ServerListEntry, ServerListRow } from '../../lib/serverList';
import {
  CONNECTOR_GROUPS,
  type ConnectorGroup,
  type ConnectorGroupInfo,
  connectorGroup,
  connectorGroupInfo,
  MUSTER_DESCRIPTION,
} from '../../lib/connectorGroups';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import {
  authStatusQueryKey,
  deactivatedSignInGate,
  ServerSignInStatus,
  SessionGate,
  SignInStatusActions,
  SignInStatusText,
  type StatusText,
  useConnectorGroupPaths,
  useServerPageLinks,
  useServerSignInStatus,
  useToolCatalogue,
} from '../shared';
import {
  authLabel,
  catalogueState,
  CONNECTOR_REACH_LABELS,
  CONNECTOR_REACH_ORDER,
  type ConnectorReach,
  connectorReach,
  connectorStatus,
  musterAuthLabel,
  musterReach,
  type MusterSessionState,
  musterStatus,
  rowServer,
  toolsLabel,
  unsearchedToolsNotes,
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
  /** The sub-tab to list; the customer's own connectors by default. */
  group?: ConnectorGroup;
};

type Row = {
  id: string;
  entry: ServerListEntry;
  description?: string;
  auth: string;
  tools?: string;
  /** The row's state, from muster's sign-in report and the server's own. */
  status: StatusText;
  /** The muster server to sign in to, where muster asks this person to. */
  signInServer?: string;
  /** Why that sign-in cannot help now (a deactivated connector). */
  signInGate?: string;
  reach?: ConnectorReach;
};

/** A row muster asks this person to sign in to. */
type SignInRow = Row & { signInServer: string };

function hasSignIn(row: Row): row is SignInRow {
  return row.signInServer !== undefined;
}

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

function ConnectorName({ row, href }: { row: Row; href?: string }) {
  const classes = useStyles();
  return (
    <Cell>
      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
        <span className={classes.tile} aria-hidden>
          {row.entry.displayName.charAt(0).toUpperCase()}
        </span>
        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          {/* The name is the row's link (M21): reachable by keyboard and
              opens in a new tab on cmd/middle-click; the row stays clickable. */}
          {href ? (
            <Link
              href={href}
              variant="body-medium"
              weight="bold"
              truncate
              title={row.entry.displayName}
            >
              {row.entry.displayName}
            </Link>
          ) : (
            <Text variant="body-medium" weight="bold" truncate>
              {row.entry.displayName}
            </Text>
          )}
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
  if (!hasSignIn(row)) {
    // Pressing a plain state opens the connector, like the rest of the row.
    return (
      <Cell>{row.status.label ? <StatusDot {...row.status} /> : null}</Cell>
    );
  }
  return (
    <Cell>
      {/* The row opens the connector; the sign-in and the hint must not. */}
      <span
        onPointerDown={stopRowPress}
        onPointerUp={stopRowPress}
        onClick={stopRowPress}
        onKeyDown={stopRowPress}
        role="presentation"
      >
        <ServerSignInStatus
          noun="connector"
          serverName={row.signInServer}
          displayName={row.entry.displayName}
          installation={installation}
          status={row.status}
          signInGate={row.signInGate}
        />
      </span>
    </Cell>
  );
}

type StackedRowProps = Omit<StackedRowItem, 'id'>;

/**
 * A stacked row whose connector muster asks this person to sign in to, from
 * one hook call, so the answer to a click on the button reaches the state:
 * the state and its hint on line 1; the Sign in button in the row's actions;
 * an outstanding sign-in's way back into the page ("Reopen sign-in page",
 * "Open sign-in page ↗") on a line of its own under the description, since
 * at the end of line 1 it would squeeze the name to a few characters.
 */
function SignInStackedRow({
  row,
  installation,
  ...props
}: StackedRowProps & {
  row: SignInRow;
  installation: string;
}) {
  const signInStatus = useServerSignInStatus({
    noun: 'connector',
    serverName: row.signInServer,
    displayName: row.entry.displayName,
    installation,
    status: row.status,
    signInGate: row.signInGate,
  });
  const { parts } = signInStatus;
  // Only a sign-in has buttons: an empty actions slot would still take its
  // gap at the end of line 1.
  const actions =
    parts.kind === 'sign-in' ? (
      <SignInStatusActions signInStatus={signInStatus} />
    ) : null;
  const waiting = parts.kind === 'sign-in' && parts.wait !== undefined;
  return (
    <StackedRow
      {...props}
      status={
        <SignInStatusText
          serverName={row.entry.displayName}
          signInStatus={signInStatus}
        />
      }
      {...(actions && !waiting ? { actions } : {})}
      {...(waiting && actions ? { details: actions } : {})}
    />
  );
}

function ConnectorStackedRow({
  row,
  installation,
  href,
  toolsPending,
}: {
  row: Row;
  installation: string;
  href?: string;
  toolsPending: boolean;
}) {
  const classes = useStyles();
  const props: StackedRowProps = {
    title: row.entry.displayName,
    ...(row.description ? { description: row.description } : {}),
    ...(href ? { href } : {}),
    leading: (
      <span className={classes.tile} aria-hidden>
        {row.entry.displayName.charAt(0).toUpperCase()}
      </span>
    ),
    facts: [row.auth, row.tools ?? (toolsPending ? '…' : '')],
  };
  if (hasSignIn(row)) {
    return (
      <SignInStackedRow {...props} row={row} installation={installation} />
    );
  }
  return (
    <StackedRow
      {...props}
      {...(row.status.label ? { status: <StatusDot {...row.status} /> } : {})}
    />
  );
}

/**
 * The phone layout of the table (T22 B8): at 343px the table's three
 * secondary columns froze at bui's 75px minimum, the name got ~46px, and the
 * Sign in button was clipped out of reach inside the Status cell. A stacked
 * row per connector instead:
 *
 * - line 1: the letter tile, the connector's name (the row's link), its
 *   state, and Sign in at the end as the row's action;
 * - line 2: how one signs in · its tools;
 * - under them, the description (two lines), and an outstanding sign-in's
 *   way back into the page.
 *
 * Each row is a component of its own, as `StackedRowList`'s children, so a
 * row with a sign-in reads its state and its buttons from one hook call.
 */
function ConnectorStackedList({
  rows,
  installation,
  hrefOf,
  toolsPending,
}: {
  rows: Row[];
  installation: string;
  hrefOf: (row: Row) => string | undefined;
  toolsPending: boolean;
}) {
  return (
    <StackedRowList aria-label="Connectors">
      {rows.map(row => (
        <ConnectorStackedRow
          key={row.id}
          row={row}
          installation={installation}
          href={hrefOf(row)}
          toolsPending={toolsPending}
        />
      ))}
    </StackedRowList>
  );
}

function ConnectorsTable({
  search,
  installation,
  group,
}: {
  search: string;
  installation: string;
  group: ConnectorGroup;
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

  // Every sub-tab's rows, muster's own among the internal ones: the search
  // counts what it finds on the other sub-tabs.
  const everyRow = useMemo(
    () => serverListRows(mcpServers, catalogue.data?.tools ?? undefined),
    [mcpServers, catalogue.data],
  );
  const rowsByGroup = useMemo(() => {
    const byGroup: Record<ConnectorGroup, ServerListRow[]> = {
      yours: [],
      infrastructure: [],
      internal: [],
    };
    for (const row of everyRow) {
      byGroup[connectorGroup(row.row)].push(row);
    }
    return byGroup;
  }, [everyRow]);
  const listRows = rowsByGroup[group];
  // muster's own row reports only what was observed: the backend's probe,
  // the session, and whether muster listed its tools.
  const sessionFailed = session.failure !== undefined;
  const answered = catalogue.data !== undefined;
  const catalogueFailed = Boolean(catalogue.error);
  // What the search's tool names came from, for an empty result to say.
  const searchedTools = catalogueState({
    answered,
    truncated: Boolean(catalogue.data?.truncated),
    loading: (!hasSession && session.pending) || isAwaitingData(catalogue),
    failed: catalogueFailed,
  });
  const musterSession = useMemo<MusterSessionState>(
    () => ({
      requiresAuth: activeInstallationInfo?.requiresAuth,
      reachable: activeInstallationInfo?.reachable,
      authenticated: session.authenticated,
      pending: session.pending,
      failed: sessionFailed,
      answered,
      catalogueFailed,
    }),
    [
      activeInstallationInfo?.requiresAuth,
      activeInstallationInfo?.reachable,
      session.authenticated,
      session.pending,
      sessionFailed,
      answered,
      catalogueFailed,
    ],
  );
  const toRow = useCallback(
    (entry: ServerListEntry): Row => {
      if (entry.row.kind === 'core') {
        const reach = musterReach(musterSession);
        return {
          id: entry.key,
          entry,
          description: MUSTER_DESCRIPTION,
          auth: musterAuthLabel(musterSession.requiresAuth),
          tools: toolsLabel(entry),
          status: musterStatus(musterSession),
          ...(reach ? { reach } : {}),
        };
      }
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
        status: connectorStatus(entry, status),
        ...(asksSignIn && server?.canAuthenticateInteractively()
          ? { signInServer: entry.id }
          : {}),
        ...(server?.getSuspended()
          ? { signInGate: deactivatedSignInGate('connector') }
          : {}),
        ...(reach ? { reach } : {}),
      };
    },
    [installation, authStatus.data, musterSession],
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
  const isPhone = usePhoneLayout();
  const hrefOf = (row: Row) =>
    row.entry.shadowed
      ? undefined
      : links.server(row.entry.id, installation, {
          q: row.entry.toolMatches ? search.trim() : undefined,
        });

  const columns: ColumnConfig<Row>[] = [
    {
      id: 'name',
      label: 'Connector',
      isRowHeader: true,
      defaultWidth: '3fr',
      cell: row => <ConnectorName row={row} href={hrefOf(row)} />,
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

  const info = connectorGroupInfo(group);
  // Where a search that finds nothing here finds something: on an empty
  // sub-tab too, where the palette's "+N more" may land.
  const otherMatches = (
    <OtherGroupMatches
      group={group}
      rowsByGroup={rowsByGroup}
      search={search}
    />
  );
  let list;
  if (listRows.length === 0) {
    list = (
      <Flex direction="column" gap="2">
        <EmptyStateCard
          title={info.empty.title}
          description={info.empty.description}
        />
        {otherMatches}
      </Flex>
    );
  } else if (rows.length === 0) {
    // A search that found nothing says what it could not look at, where the
    // tool may still be: among the connectors the filters keep.
    const unsearched =
      search.trim() === ''
        ? []
        : unsearchedToolsNotes(
            searchedTools,
            applyCatalogFilters(allRows, CONNECTOR_FACETS, filters.selection),
            authStatus.data !== undefined,
          );
    const toolsSearched =
      searchedTools === 'loaded' || searchedTools === 'partial';
    list = (
      <Flex direction="column" gap="2">
        <CatalogNoMatch
          plural={toolsSearched ? 'connectors or tools' : 'connectors'}
          search={search}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clear}
        />
        {unsearched.length > 0 && (
          <Text as="p" variant="body-medium" color="secondary">
            {unsearched.join(' ')}
          </Text>
        )}
        {otherMatches}
      </Flex>
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
        {page =>
          isPhone ? (
            <ConnectorStackedList
              rows={page}
              installation={installation}
              hrefOf={hrefOf}
              toolsPending={isAwaitingData(catalogue)}
            />
          ) : (
            <Table<Row>
              columnConfig={columns}
              data={page}
              pagination={{ type: 'none' }}
              rowConfig={{ getHref: hrefOf }}
            />
          )
        }
      </ShowMore>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {info.description && (
        <Text as="p" variant="body-medium" color="secondary">
          {info.description}
        </Text>
      )}
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

/**
 * Where a search that finds nothing on this sub-tab finds something: the
 * other sub-tabs with their match counts, as links that keep the search. The
 * command palette's "+N more" lands on the default sub-tab, whatever it found.
 */
function OtherGroupMatches({
  group,
  rowsByGroup,
  search,
}: {
  group: ConnectorGroup;
  rowsByGroup: Record<ConnectorGroup, ServerListRow[]>;
  search: string;
}) {
  const paths = useConnectorGroupPaths();
  const location = useLocation();
  const query = search.trim();
  const matches = useMemo(
    () =>
      query === ''
        ? []
        : CONNECTOR_GROUPS.filter(other => other.id !== group)
            .map(other => ({
              other,
              count: serverListEntries(rowsByGroup[other.id], query).length,
            }))
            .filter(({ count }) => count > 0),
    [group, rowsByGroup, query],
  );
  if (matches.length === 0) {
    return null;
  }
  const link = (other: ConnectorGroupInfo) => {
    const href = paths.group(other.id);
    return href ? (
      <Link href={`${href}${location.search}`}>{other.title}</Link>
    ) : (
      other.title
    );
  };
  return (
    <Text as="p" variant="body-medium" color="secondary">
      The search matches{' '}
      {matches.map(({ other, count }, index) => (
        <Fragment key={other.id}>
          {index > 0 && ' and '}
          {countNoun(count, 'connector')} on {link(other)}
        </Fragment>
      ))}
      .
    </Text>
  );
}

function Panel({ search, group = 'yours' }: CustomizeConnectorsPanelProps) {
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
      <ConnectorsTable
        search={search}
        installation={activeInstallation}
        group={group}
      />
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
 * One sub-tab of the Connectors tab of the shell's Customize screen
 * (`connectorGroup`: the customer's own connectors, those for the
 * infrastructure the platform runs on, or the platform's internal servers with
 * muster itself): the active muster's
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
