import { type ReactNode, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Cell,
  CellText,
  Column,
  ColumnConfig,
  Flex,
  Link,
  Table,
  Text,
  useTable,
  VisuallyHidden,
} from '@backstage/ui';
import {
  applyCatalogFilters,
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  LoadingIndicator,
  StackedRow,
  type StackedRowItem,
  StackedRowList,
  isAwaitingData,
  ROW_TAGS_MAX,
  TagList,
  TAGS_COLUMN_MIN_WIDTH,
  tagsFacet,
  stopRowPress,
  useCatalogFilters,
  usePhoneLayout,
  type PollingQuery,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef, type AuthStatusResponse } from '../../apis';
import { musterPollingOptions } from '../../lib/musterPolling';
import { ConnectorLogo } from '../ConnectorLogo';
import { serverListEntries, serverListRows } from '../../lib/serverList';
import type { ServerListEntry } from '../../lib/serverList';
import { isRegisteredRow, MUSTER_DESCRIPTION } from '../../lib/connectorTags';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The portal session is the gs plugin's main sign-in.
import { useMainSessionEnd } from '@giantswarm/backstage-plugin-gs';
import { SESSION_ENDED_DESCRIPTION } from '../../lib/sessionEnded';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import {
  authStatusQueryKey,
  connectingPollInterval,
  deactivatedSignInGate,
  isSsoRefused,
  needsSignIn,
  SessionGate,
  signInRefusalOf,
  SignInStatusActions,
  SignInStatusText,
  StatusWithHint,
  type ExplainedStatusText,
  useServerPageLinks,
  useConnectorIcon,
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
  NO_TOOLS_VALUE,
  toolsLabel,
  toolsUnavailable,
  unsearchedToolsNotes,
} from './connectorRows';
import {
  CONNECTORS_DEFAULT_SORT,
  sortConnectorRows,
} from './sortConnectorRows';

export type CustomizeConnectorsPanelProps = {
  search: string;
};

type Row = {
  id: string;
  entry: ServerListEntry;
  description?: string;
  auth: string;
  tools?: string;
  /** The row's state, from muster's sign-in report and the server's own. */
  status: ExplainedStatusText;
  /** The muster server to sign in to, where muster asks this person to. */
  signInServer?: string;
  /** Why that sign-in cannot help now (a deactivated connector). */
  signInGate?: string;
  /**
   * Whether that sign-in has a button: muster asks for it and has not
   * refused it. An SSO connector that refused the sign-in has only its hint.
   */
  signInButton?: boolean;
  reach?: ConnectorReach;
  tags: string[];
};

/** A row muster asks this person to sign in to. */
type SignInRow = Row & { signInServer: string };

function hasSignIn(row: Row): row is SignInRow {
  return row.signInServer !== undefined;
}

/**
 * The Connectors tab's facets (T49): how a person signs in, whether the
 * connector answers now (with this person's sign-in), and its tags.
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
  tagsFacet<Row>(row => row.tags),
];

function ConnectorName({
  row,
  href,
  installation,
  hasSession,
}: {
  row: Row;
  href?: string;
  installation: string;
  hasSession: boolean;
}) {
  // Read per row, so muster's icon arriving re-renders its logo only.
  const icon = useConnectorIcon(row.entry.row, installation, hasSession);
  return (
    <Cell>
      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
        <ConnectorLogo name={row.entry.displayName} icon={icon} decorative />
        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          {/* The name is the row's link (M21): reachable by keyboard and
              opens in a new tab on cmd/middle-click; the row stays clickable. */}
          {href ? (
            <Link
              standalone
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

/** What the row's sign-in hook is called with, wherever the row shows it. */
function signInStatusOptions(row: SignInRow, installation: string) {
  return {
    noun: 'connector' as const,
    serverName: row.signInServer,
    displayName: row.entry.displayName,
    installation,
    status: row.status,
    signInGate: row.signInGate,
  };
}

function ConnectorStatusCell({
  row,
  installation,
}: {
  row: Row;
  installation: string;
}) {
  if (!hasSignIn(row)) {
    if (!row.status.label) {
      return <Cell />;
    }
    const status = (
      <StatusWithHint {...row.status} subject={row.entry.displayName} wrap />
    );
    // Pressing a plain state opens the connector, like the rest of the row;
    // a state with a hint keeps the press, as a sign-in's does.
    return (
      <Cell>
        {row.status.explanation ? (
          <StopRowPress>{status}</StopRowPress>
        ) : (
          status
        )}
      </Cell>
    );
  }
  return <SignInStatusCell row={row} installation={installation} />;
}

/** The state of a row with a sign-in, as the sign-in's answers change it. */
function SignInStatusCell({
  row,
  installation,
}: {
  row: SignInRow;
  installation: string;
}) {
  const signInStatus = useServerSignInStatus(
    signInStatusOptions(row, installation),
  );
  return (
    <Cell>
      {/* The row opens the connector; the hint must not. */}
      <StopRowPress>
        <SignInStatusText
          serverName={row.entry.displayName}
          signInStatus={signInStatus}
          wrap
        />
      </StopRowPress>
    </Cell>
  );
}

/**
 * The sign-in's buttons, in a column of their own: they line up across rows,
 * beside the state rather than under it. The same sign-in as the state's,
 * whose answers both cells read.
 */
function ConnectorSignInCell({
  row,
  installation,
}: {
  row: Row;
  installation: string;
}) {
  if (!hasSignIn(row) || !row.signInButton) {
    return <Cell />;
  }
  return <SignInActionsCell row={row} installation={installation} />;
}

function SignInActionsCell({
  row,
  installation,
}: {
  row: SignInRow;
  installation: string;
}) {
  const signInStatus = useServerSignInStatus(
    signInStatusOptions(row, installation),
  );
  return (
    <Cell>
      <StopRowPress>
        <SignInStatusActions signInStatus={signInStatus} wrap />
      </StopRowPress>
    </Cell>
  );
}

/**
 * A column whose header is read to a screen reader only, from the column's
 * own label and sizes.
 */
function withHiddenLabel<T extends { id: string | number }>(
  column: ColumnConfig<T>,
): ColumnConfig<T> {
  return {
    ...column,
    header: () => (
      <Column
        id={column.id}
        width={column.width}
        defaultWidth={column.defaultWidth}
        minWidth={column.minWidth}
        maxWidth={column.maxWidth}
      >
        <VisuallyHidden>{column.label}</VisuallyHidden>
      </Column>
    ),
  };
}

/** Keeps a press inside to itself: the row around it opens the connector. */
function StopRowPress({ children }: { children: ReactNode }) {
  return (
    <span
      onPointerDown={stopRowPress}
      onPointerUp={stopRowPress}
      onClick={stopRowPress}
      onKeyDown={stopRowPress}
      role="presentation"
      // Centred in the cell like its text, and free to shrink so a label
      // wraps inside it rather than past the cell's edge.
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      {children}
    </span>
  );
}

type StackedRowProps = Omit<StackedRowItem, 'id'>;

/** "Sign in" on one line; "Open sign-in page" on two. */
const STACKED_ACTION_MAX_WIDTH = '7.5rem';

/**
 * A stacked row whose connector muster asks this person to sign in to, from
 * one hook call: the state and its hint on line 1, and the sign-in's button
 * in the row's actions at its end, in every state of the sign-in. A label
 * longer than "Sign in" ("Open sign-in page", "Reopen sign-in page") wraps
 * inside the button, so the name keeps its width and the button its place.
 */
function SignInStackedRow({
  row,
  installation,
  ...props
}: StackedRowProps & {
  row: SignInRow;
  installation: string;
}) {
  const signInStatus = useServerSignInStatus(
    signInStatusOptions(row, installation),
  );
  // Only a sign-in has buttons: an empty actions slot would still take its
  // gap at the end of line 1.
  const actions =
    signInStatus.parts.kind === 'sign-in' ? (
      <span style={{ display: 'flex', maxWidth: STACKED_ACTION_MAX_WIDTH }}>
        <SignInStatusActions signInStatus={signInStatus} wrap />
      </span>
    ) : null;
  return (
    <StackedRow
      {...props}
      status={
        <SignInStatusText
          serverName={row.entry.displayName}
          signInStatus={signInStatus}
        />
      }
      {...(actions ? { actions } : {})}
    />
  );
}

function ConnectorStackedRow({
  row,
  installation,
  hasSession,
  href,
  toolsPending,
}: {
  row: Row;
  installation: string;
  hasSession: boolean;
  href?: string;
  toolsPending: boolean;
}) {
  const icon = useConnectorIcon(row.entry.row, installation, hasSession);
  const props: StackedRowProps = {
    title: row.entry.displayName,
    ...(row.description ? { description: row.description } : {}),
    ...(href ? { href } : {}),
    leading: (
      <ConnectorLogo name={row.entry.displayName} icon={icon} decorative />
    ),
    facts: [
      row.tags.length > 0 ? (
        <TagList tags={row.tags} max={ROW_TAGS_MAX} />
      ) : null,
      row.auth,
      toolsUnavailable(row.entry, row.reach)
        ? ''
        : (row.tools ?? (toolsPending ? '…' : '')),
    ],
  };
  if (hasSignIn(row)) {
    return (
      <SignInStackedRow {...props} row={row} installation={installation} />
    );
  }
  return (
    <StackedRow
      {...props}
      {...(row.status.label
        ? {
            status: (
              <StatusWithHint {...row.status} subject={row.entry.displayName} />
            ),
          }
        : {})}
    />
  );
}

/**
 * The phone layout of the table (T22 B8): at 343px the table's three
 * secondary columns froze at bui's 75px minimum, the name got ~46px, and the
 * Sign in button was clipped out of reach inside the Status cell. A stacked
 * row per connector instead:
 *
 * - line 1: the connector's logo, its name (the row's link), its
 *   state, and the sign-in's button at the end as the row's action;
 * - line 2: its tags · how one signs in · its tools;
 * - under them, the description (two lines).
 *
 * Each row is a component of its own, as `StackedRowList`'s children, so a
 * row with a sign-in reads its state and its buttons from one hook call.
 */
function ConnectorStackedList({
  rows,
  installation,
  hasSession,
  hrefOf,
  toolsPending,
}: {
  rows: Row[];
  installation: string;
  hasSession: boolean;
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
          hasSession={hasSession}
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
    // While muster still connects a server; not from a hidden tab, not after
    // muster refused the person. No read on becoming visible: the client
    // keeps focus refetches off and `staleTime` at 0.
    ...musterPollingOptions(
      (query: PollingQuery<AuthStatusResponse>) =>
        connectingPollInterval(query.state.data),
      { refetchOnVisible: false },
    ),
  });

  // Every connector, muster's own row among them.
  const listRows = useMemo(
    () => serverListRows(mcpServers, catalogue.data?.tools ?? undefined),
    [mcpServers, catalogue.data],
  );
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
          tags: entry.tags,
        };
      }
      const server = rowServer(entry, installation);
      const status =
        entry.row.kind === 'server'
          ? authStatus.data?.servers.find(s => s.name === entry.id)
          : undefined;
      // An SSO server that refused the sign-in has no button, but its hint
      // says why, so it takes the sign-in row too.
      const asksSignIn = Boolean(
        status && (needsSignIn(status) || isSsoRefused(status)),
      );
      const reach = connectorReach(entry, status);
      return {
        id: entry.key,
        entry,
        description: server?.getDescription(),
        auth: authLabel(server),
        tools: toolsLabel(entry),
        status: connectorStatus(entry, status),
        ...(asksSignIn && server?.canAuthenticateInteractively()
          ? {
              signInServer: entry.id,
              signInButton: Boolean(
                status && needsSignIn(status) && !signInRefusalOf(status),
              ),
            }
          : {}),
        ...(server?.getSuspended()
          ? { signInGate: deactivatedSignInGate('connector') }
          : {}),
        ...(reach ? { reach } : {}),
        tags: entry.tags,
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
  // One list by name, muster and the platform's own connectors among the
  // rest; a header click sorts by its column, a second one reverses it.
  const { tableProps } = useTable<Row>({
    mode: 'complete',
    data: filters.filtered,
    sortFn: sortConnectorRows,
    initialSort: CONNECTORS_DEFAULT_SORT,
    // Every connector at once: no pages, no "Show more".
    paginationOptions: { type: 'none' },
  });
  const isPhone = usePhoneLayout();
  // The phone's stacked rows have no headers to show or change a sort with:
  // they stay by name whatever the table was sorted by.
  const stackedRows = useMemo(
    () =>
      isPhone
        ? sortConnectorRows(filters.filtered, CONNECTORS_DEFAULT_SORT)
        : [],
    [isPhone, filters.filtered],
  );
  const rows = isPhone ? stackedRows : (tableProps.data ?? []);
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
      isSortable: true,
      defaultWidth: '3fr',
      cell: row => (
        <ConnectorName
          row={row}
          href={hrefOf(row)}
          installation={installation}
          hasSession={hasSession}
        />
      ),
    },
    {
      id: 'tags',
      label: 'Tags',
      defaultWidth: '1.4fr',
      minWidth: TAGS_COLUMN_MIN_WIDTH,
      cell: row => (
        <Cell>
          <TagList tags={row.tags} max={ROW_TAGS_MAX} />
        </Cell>
      ),
    },
    {
      id: 'auth',
      label: 'Sign-in',
      isSortable: true,
      defaultWidth: '1.2fr',
      cell: row => <CellText title={row.auth} />,
    },
    {
      id: 'tools',
      label: 'Tools',
      isSortable: true,
      defaultWidth: '1fr',
      cell: row => (
        <CellText
          title={
            toolsUnavailable(row.entry, row.reach)
              ? NO_TOOLS_VALUE
              : (row.tools ?? (isAwaitingData(catalogue) ? '…' : ''))
          }
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      isSortable: true,
      defaultWidth: '1.3fr',
      // The longest word of a state ("Connected", "Deactivated") with its
      // dot and hint; the state wraps between its words below its share.
      minWidth: 136,
      cell: row => (
        <ConnectorStatusCell row={row} installation={installation} />
      ),
    },
    withHiddenLabel<Row>({
      id: 'signIn',
      label: 'Actions',
      defaultWidth: '1.2fr',
      // "Sign in" on one line; a longer label wraps.
      minWidth: 96,
      // No room taken where no connector offers a sign-in.
      isHidden: !rows.some(row => row.signInButton),
      cell: row => (
        <ConnectorSignInCell row={row} installation={installation} />
      ),
    }),
  ];

  // The list is never empty (the platform's own connectors and muster are
  // always there), so where none is registered yet, it says how to add one.
  const hasRegistered = listRows.some(listRow => isRegisteredRow(listRow.row));
  const showAddPrompt =
    !hasRegistered && search.trim() === '' && !filters.isFiltered;
  let list;
  if (rows.length === 0) {
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
      </Flex>
    );
  } else {
    list = isPhone ? (
      <ConnectorStackedList
        rows={rows}
        installation={installation}
        hasSession={hasSession}
        hrefOf={hrefOf}
        toolsPending={isAwaitingData(catalogue)}
      />
    ) : (
      <Table<Row>
        {...tableProps}
        columnConfig={columns}
        rowConfig={{ getHref: hrefOf }}
      />
    );
  }

  return (
    <Flex direction="column" gap="4">
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
        onClear={filters.clear}
      />
      {showAddPrompt && (
        <EmptyStateCard
          title="No connectors added yet"
          description="Add a connector to give agents its tools. The platform's own connectors are listed below."
        />
      )}
      {!hasSession && (
        <SessionGate
          session={session}
          installation={installation}
          context="Tool counts and sign-ins need a Muster session."
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
  const sessionEnd = useMainSessionEnd();

  let body;
  if (sessionEnd && (isLoading || !activeInstallation)) {
    body = (
      <EmptyStateCard
        title="Could not read your connectors"
        description={SESSION_ENDED_DESCRIPTION}
      />
    );
  } else if (isLoading) {
    body = <LoadingIndicator label="Reading your connectors…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyStateCard
        title="No connectors here"
        description="None of your environments runs Muster, which connects agents to tools."
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
 * servers and muster itself as flat rows by name, every one at once and
 * sorted again by a header click, with how one signs in, their tool count and
 * state, and a sign-in where muster asks this person for one; filtered by
 * sign-in, by connection and by tags where those tell connectors apart (T49).
 * The platform's own connectors carry a tag from their tool-group label
 * (`connectorTags`), so `?tags=infrastructure` or `?tags=agent-platform`
 * lists them. Must be mounted inside a `CustomizeMusterProvider`.
 */
export function CustomizeConnectorsPanel(props: CustomizeConnectorsPanelProps) {
  return (
    <QueryClientProvider>
      <Panel {...props} />
    </QueryClientProvider>
  );
}
