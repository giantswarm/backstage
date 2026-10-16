import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';

import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Button, ButtonIcon, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useQuery } from '@tanstack/react-query';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import {
  BreadcrumbItem,
  type Fact,
  CopyButton,
  DisabledAction,
  EmptyStateCard,
  LoadingIndicator,
  MoreActionsMenu,
  type MoreActionsMenuItem,
  RouteTabSpec,
  ShellDocumentTitle,
  ShellPage,
  ShellPageBadgeSkeleton,
  StatusDot,
  type StatusDotTone,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from '../../lib/k8s';
import { isGitOpsManaged } from '../../lib/gitops';
import { isReadOnly } from '../../lib/toolAnnotations';
import { serverPageResolver } from '../../lib/toolGrouping';
import { mcpServersRouteRef } from '../../routes';
import { MUSTER_PAGE_DESCRIPTION } from '../../lib/connectorGroups';
import {
  familyGroups,
  findServerRow,
  fleetManagementClusters,
  partitionServers,
  mcpServerDisplayNames,
  ServerPageRow,
  serverRowDisplayName,
  serverRowKey,
} from '../../lib/serverGrouping';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { noToolsExplanation } from '../McpServersPage/serverDetail';
import { type ConnectorPageTabPath } from './connectorTabs';
import { useConnectorWizardLinks } from '../NewMcpServerEditGate';
import {
  AdHocServerDialog,
  ConfirmActionDialog,
  LiveAction,
  serverLiveActions,
} from '../ServerPage/serverActions';
import { ServerCapabilityTab } from '../ServerPage/ServerCapabilityTab';
import { ServerInstancesTab } from '../ServerPage/ServerInstancesTab';
import {
  representativeServer,
  useServerTools,
} from '../ServerPage/useServerPageData';
import { useServerCapabilityCounts } from '../McpServersPage/serverDetail';
import {
  authActionParts,
  deactivatedSignInGate,
  familyHealthLabel,
  ServerAuthActions,
  serverStateLabel,
  SessionGate,
  useConnectorGroupPaths,
  useServerSignIn,
} from '../shared';
// Imported directly: the shared barrel stays free of flux-react.
import { GitOpsEditDialog } from '../shared/GitOpsEditDialog';
import {
  addedLine,
  callsLine,
  healthLine,
  signInLabel,
} from './connectorFacts';
import {
  ConnectorPageTarget,
  ConnectorPageTargetProvider,
} from './connectorPageTarget';
import { ConnectorToolsTab, useToolSearchState } from './ConnectorToolsTab';
import { ConnectorDetailsTab } from './ConnectorDetailsTab';
import { connectorEditBlock, SESSION_ACTIONS_REASON } from './connectorEdit';

/** How long a success toast stays, as on the platform's other deletes. */
const TOAST_TIMEOUT_MS = 6000;

const useStyles = makeStyles({
  tile: {
    flex: 'none',
    width: 56,
    height: 56,
    borderRadius: 14,
    border: '1px solid var(--bui-border-1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--bui-fg-secondary)',
    textTransform: 'uppercase',
  },
});

/**
 * muster's endpoint, the address an MCP client connects to, with its copy
 * button: under the page's title, above its tabs, since it is what the page
 * is opened for more often than its tools.
 */
function MusterEndpoint({ endpoint }: { endpoint: string }) {
  // Inline: the page's description is a paragraph.
  return (
    <>
      Endpoint{' '}
      <Text
        as="span"
        variant="body-medium"
        color="primary"
        style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
      >
        {endpoint}
      </Text>{' '}
      <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        <CopyButton text={endpoint} label="Copy endpoint" size="compact" />
      </span>
    </>
  );
}

function ConnectorTile({ name }: { name: string }) {
  const classes = useStyles();
  return (
    <span className={classes.tile} aria-hidden>
      {name.charAt(0)}
    </span>
  );
}

/** The page's dot tones for muster's severities, as the list's dots read. */
const SEVERITY_DOT_TONE: Record<MCPServerSeverity, StatusDotTone> = {
  ok: 'success',
  warning: 'warning',
  error: 'danger',
  unknown: 'neutral',
};

/**
 * The connector's state beside its name: a dot and its words, as the
 * Customize list and the agent, model and session headers draw a state. The
 * words stay muster's own (`serverStateLabel`, `familyHealthLabel`), with the
 * Ready condition's explanation as the tooltip.
 */
function StatusBadge({ row }: { row: ServerPageRow }) {
  if (row.kind === 'server') {
    return (
      <span title={row.server.getStateExplanation()}>
        <StatusDot
          tone={
            SEVERITY_DOT_TONE[mcpServerStateSeverity(row.server.getState())]
          }
          label={serverStateLabel(row.server)}
        />
      </span>
    );
  }
  if (row.kind === 'family') {
    const worst = row.servers
      .map(server => mcpServerStateSeverity(server.getState()))
      .reduce<MCPServerSeverity>(worstSeverity, 'ok');
    return (
      <StatusDot
        tone={SEVERITY_DOT_TONE[worst]}
        label={familyHealthLabel(row.servers)}
      />
    );
  }
  return null;
}

function rowServers(row: ServerPageRow): MCPServer[] {
  if (row.kind === 'server') {
    return [row.server];
  }
  if (row.kind === 'family') {
    return row.servers;
  }
  return [];
}

/**
 * The calls muster dispatched to the connector since the 1st of the month
 * (UTC). Undefined while unread, and where usage cannot be queried.
 */
function useCallsThisMonth(
  installation: string,
  serverNames: string[],
  enabled: boolean,
): string | undefined {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    queryKey: ['muster', 'mcp-usage', installation, 'month'],
    queryFn: () => musterApi.getMcpUsage({ installation, window: 'month' }),
    enabled: enabled && serverNames.length > 0,
  });
  return data ? callsLine(data, serverNames) : undefined;
}

function ConnectorPageContent({
  row,
  displayName,
  servers,
  installation,
  usedBy,
}: {
  row: ServerPageRow;
  /** What people call it; `serverRowKey(row)` stays what links and muster use. */
  displayName: string;
  servers: MCPServer[];
  installation: string;
  usedBy?: ReactElement;
}) {
  const session = useMusterSession();
  const { authenticated } = session;
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);
  const basePath = useSplatBasePath();
  const paths = useConnectorGroupPaths();
  // The sub-tab that lists the connector, where its crumb and a removal lead.
  const listPath = paths.listOf(serverRowKey(row), row);
  const { activeInstallationInfo } = useMusterInstance();
  const endpoint =
    row.kind === 'core' ? activeInstallationInfo?.endpoint : undefined;
  const serversRoute = useRouteRef(mcpServersRouteRef);
  const name = serverRowKey(row);
  const members = useMemo(() => rowServers(row), [row]);
  const representativeInfo = representativeServer(row, installation);
  const representative = representativeInfo?.server;
  const singular = row.kind === 'server' ? row.server : undefined;

  // Above the tabs, so a search on Tools survives a visit to another tab:
  // the tab links carry no query, and the page is keyed per
  // connector, so another connector starts afresh.
  const toolSearch = useToolSearchState();
  const tools = useServerTools(row, servers, installation, {
    enabled: authenticated,
  });
  const counts = useServerCapabilityCounts(representative, {
    enabled: authenticated,
  });
  const fleetClusters = useMemo(
    () => fleetManagementClusters(familyGroups(partitionServers(servers))),
    [servers],
  );

  const serverNames = useMemo(
    () => [...new Set([name, ...members.map(server => server.getName())])],
    [name, members],
  );
  const calls = useCallsThisMonth(
    installation,
    row.kind === 'core' ? [] : serverNames,
    authenticated,
  );

  // The person's own sign-in to the connector. Signing in is offered where its
  // absence shows — the Tools tab's gate, in place of the hidden tools — so
  // the header's actions are the same whatever this state is; signing out is
  // a menu entry.
  const canSignIn = Boolean(
    singular && authenticated && singular.canAuthenticateInteractively(),
  );
  const signIn = useServerSignIn(
    singular?.getName() ?? '',
    canSignIn ? installation : undefined,
    { noun: 'connector' },
  );
  // An SSO connector muster failed to connect for this person: the Customize
  // list says "Could not sign in" and keeps the why in a hint; this page says
  // it in full. Where muster asks for a sign-in, the Tools tab's gate already
  // carries the same sentence.
  const signInParts = canSignIn
    ? authActionParts(displayName, signIn, { noun: 'connector' })
    : undefined;
  const ssoFailure =
    signInParts?.kind === 'sso' && !signIn.needsLogin
      ? signInParts.explanation
      : undefined;
  const canSignOut =
    canSignIn &&
    !signIn.isSsoManaged &&
    singular!.getAuth()?.type === 'oauth' &&
    signIn.isConnected;

  // Edit opens the connector wizard on this connector (its `edit` address),
  // the flow that added it; the wizard's edit gate seeds it from the server
  // list.
  const editBlock = connectorEditBlock(row, authenticated);
  const wizardLinks = useConnectorWizardLinks();
  const editHref =
    singular && !editBlock
      ? wizardLinks('connect', { name: singular.getName(), installation })
      : undefined;
  const gitOpsManaged = singular ? isGitOpsManaged(singular) : false;

  const [action, setAction] = useState<LiveAction | undefined>();
  const [actionOpen, setActionOpen] = useState(false);
  const openAction = (next: LiveAction) => {
    setAction(next);
    setActionOpen(true);
  };
  const [gitOpsOpen, setGitOpsOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);

  const menu: MoreActionsMenuItem[] = [];
  if (singular && gitOpsManaged) {
    menu.push({
      id: 'edit-in-git',
      label: 'Edit in Git…',
      onAction: () => setGitOpsOpen(true),
    });
  }
  if (singular && editBlock?.cause === 'wizard') {
    menu.push({
      id: 'edit-as-json',
      label: 'Edit as JSON…',
      onAction: () => setJsonOpen(true),
    });
  }
  if (canSignOut) {
    menu.push({
      id: 'sign-out',
      label: 'Sign out',
      onAction: () => signIn.signOut(),
    });
  }
  if (singular && authenticated && !gitOpsManaged) {
    const live = serverLiveActions(singular);
    if (live.reconnect && !live.reconnectGate) {
      const reconnect = live.reconnect;
      menu.push({
        id: 'reconnect',
        label: 'Reconnect…',
        onAction: () => openAction(reconnect),
      });
    }
    if (live.deactivate) {
      const deactivate = live.deactivate;
      menu.push({
        id: 'turn-off',
        label: 'Turn off…',
        onAction: () =>
          openAction({
            ...deactivate,
            label: `Turn off "${displayName}"?`,
            confirmLabel: 'Turn off',
          }),
      });
    }
    if (live.activate) {
      const activate = live.activate;
      menu.push({
        id: 'turn-on',
        label: 'Turn on…',
        onAction: () =>
          openAction({
            ...activate,
            label: `Turn on "${displayName}"?`,
            confirmLabel: 'Turn on',
          }),
      });
    }
    menu.push({
      id: 'remove',
      label: 'Remove…',
      danger: true,
      onAction: () =>
        openAction({
          ...live.remove,
          label: `Remove "${displayName}"?`,
          confirmLabel: 'Remove',
        }),
    });
  }

  const readOnlyToolCount = tools.tools?.filter(isReadOnly).length;
  const target = useMemo<ConnectorPageTarget>(() => {
    const ownerOf = serverPageResolver(servers);
    return {
      name,
      installation,
      serverNames,
      ownsTool: toolName => ownerOf(toolName) === name,
      readOnlyToolCount,
    };
  }, [name, installation, serverNames, servers, readOnlyToolCount]);

  const sessionGate: ReactNode = authenticated ? undefined : (
    <SessionGate
      session={session}
      installation={installation}
      context="Tools need a muster session."
    />
  );
  const signInGate: ReactNode =
    singular && canSignIn && signIn.needsLogin ? (
      <Flex direction="column" gap="2" align="start">
        <Text as="p" variant="body-medium">
          Sign in to this connector to see its tools.
        </Text>
        <ServerAuthActions
          noun="connector"
          serverName={singular.getName()}
          displayName={displayName}
          installation={installation}
          oauthConfigured={singular.getAuth()?.type === 'oauth'}
          signInGate={
            singular.getSuspended()
              ? deactivatedSignInGate('connector')
              : undefined
          }
        />
      </Flex>
    ) : undefined;

  const emptyExplanation = singular
    ? noToolsExplanation(singular)
    : 'No instance offers tools right now.';

  const capabilities = (
    [
      ['resources', 'Resources', counts.resourcesCount],
      ['prompts', 'Prompts', counts.promptsCount],
    ] as const
  ).map(([capability, title, count]) => ({
    capability,
    title,
    count,
    shown: (count ?? 0) > 0,
  }));

  const tabs: RouteTabSpec[] = [
    {
      id: 'tools',
      path: '',
      title: 'Tools',
      count: tools.isLoading ? 'loading' : tools.tools?.length,
    },
  ];
  // Every other tab by its path, one of `CONNECTOR_PAGE_TAB_PATHS`.
  const addTab = (
    path: ConnectorPageTabPath,
    title: string,
    count?: RouteTabSpec['count'],
  ) => tabs.push({ id: path, path, title, count });
  for (const { capability, title, count, shown } of capabilities) {
    if (shown) {
      addTab(capability, title, count);
    }
  }
  if (usedBy && row.kind !== 'core') {
    addTab('used-by', 'Used by');
  }
  if (row.kind === 'family') {
    addTab('instances', 'Instances', row.servers.length);
  }

  // The Details tab's plain facts; the address and the rest of the MCPServer
  // are in its Technical details.
  const facts: Fact[] = [];
  if (representative) {
    facts.push({ label: 'Sign-in', value: signInLabel(representative) });
  }
  if (members.length > 0) {
    facts.push({ label: 'Health', value: healthLine(members) });
  }
  if (calls !== undefined) {
    facts.push({ label: 'Calls this month', value: calls });
  }
  const added = addedLine(members);
  if (added) {
    facts.push({ label: 'Added', value: added });
  }
  // Last, as the agent page's Overview is first: the tab people open least.
  // muster itself has neither facts nor an MCPServer, so no Details.
  const hasDetails = row.kind !== 'core';
  if (hasDetails) {
    addTab('details', 'Details');
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: paths.customize },
    { label: 'Connectors', href: listPath },
    { label: displayName },
  ];

  const toIndex = <Navigate to={basePath} replace />;

  // The same two controls in the same place for every connector, whatever
  // its sign-in state or session: Edit, disabled with the reason where it
  // cannot be used, then the menu — itself disabled with the reason while
  // nothing in it is available. Only muster itself, which is never edited,
  // has neither.
  let editAction: ReactNode;
  if (row.kind !== 'core') {
    editAction = editHref ? (
      <Button variant="secondary" onPress={() => navigate(editHref)}>
        Edit
      </Button>
    ) : (
      <DisabledAction
        reason={
          editBlock?.reason ?? 'The connector wizard is not available here.'
        }
      >
        {describedBy => (
          <Button variant="secondary" isDisabled aria-describedby={describedBy}>
            Edit
          </Button>
        )}
      </DisabledAction>
    );
  }
  let menuAction: ReactNode;
  if (menu.length > 0) {
    menuAction = <MoreActionsMenu items={menu} />;
  } else if (singular) {
    // Only without a muster session: every action runs through it.
    menuAction = (
      <DisabledAction reason={SESSION_ACTIONS_REASON}>
        {describedBy => (
          <ButtonIcon
            icon={<MoreVertIcon />}
            aria-label="More actions"
            variant="tertiary"
            isDisabled
            aria-describedby={describedBy}
          />
        )}
      </DisabledAction>
    );
  }

  return (
    <ConnectorPageTargetProvider target={target}>
      <ShellPage
        title={displayName}
        breadcrumbs={breadcrumbs}
        leading={<ConnectorTile name={displayName} />}
        badges={<StatusBadge row={row} />}
        meta={
          row.kind === 'core'
            ? MUSTER_PAGE_DESCRIPTION
            : representative?.getDescription()
        }
        description={
          endpoint ? <MusterEndpoint endpoint={endpoint} /> : undefined
        }
        actions={editAction}
        menu={menuAction}
        tabs={tabs}
      >
        <Flex direction="column" gap="3">
          {ssoFailure && <Alert status="danger" description={ssoFailure} />}
          {canSignIn && signIn.error && (
            <Alert status="danger" description={signIn.error} />
          )}
          {canSignIn && signIn.note && (
            <Alert status="info" description={signIn.note} />
          )}
          <Routes>
            <Route
              index
              element={
                <ConnectorToolsTab
                  server={name}
                  installation={installation}
                  tools={tools}
                  emptyExplanation={emptyExplanation}
                  sessionGate={sessionGate}
                  signInGate={signInGate}
                  searchState={toolSearch}
                />
              }
            />
            {capabilities.map(({ capability, shown }) => (
              <Route
                key={capability}
                path={capability}
                element={
                  !representativeInfo || (counts.isLoaded && !shown) ? (
                    toIndex
                  ) : (
                    <ServerCapabilityTab
                      capability={capability}
                      row={row}
                      representative={representativeInfo}
                      sessionGate={sessionGate}
                    />
                  )
                }
              />
            ))}
            {usedBy && row.kind !== 'core' && (
              <Route path="used-by" element={usedBy} />
            )}
            {row.kind === 'family' && (
              <Route
                path="instances"
                element={
                  <ServerInstancesTab
                    instances={row.servers}
                    fleetClusters={fleetClusters}
                    authenticated={authenticated}
                    windowed
                  />
                }
              />
            )}
            {hasDetails && (
              <Route
                path="details"
                element={
                  <ConnectorDetailsTab
                    row={row}
                    facts={facts}
                    representative={representative}
                    installation={installation}
                  />
                }
              />
            )}
            <Route path="*" element={toIndex} />
          </Routes>
        </Flex>
        {singular && gitOpsManaged && (
          <GitOpsEditDialog
            resource={singular}
            isOpen={gitOpsOpen}
            onOpenChange={setGitOpsOpen}
          />
        )}
        {singular && editBlock?.cause === 'wizard' && (
          <AdHocServerDialog
            server={singular}
            open={jsonOpen}
            onClose={() => setJsonOpen(false)}
          />
        )}
        {singular && !gitOpsManaged && (
          <ConfirmActionDialog
            server={singular}
            action={action}
            open={actionOpen}
            onClose={() => setActionOpen(false)}
            onDone={done => {
              const away = listPath ?? serversRoute?.();
              if (done.destructive && away) {
                // Leaving the page takes the dialog's own confirmation with
                // it, so the removal is acknowledged as the platform's other
                // deletes are: a toast on the list it returns to.
                toastApi.post({
                  title: `Connector "${displayName}" removed`,
                  status: 'success',
                  timeout: TOAST_TIMEOUT_MS,
                });
                navigate(away);
              }
            }}
          />
        )}
      </ShellPage>
    </ConnectorPageTargetProvider>
  );
}

export interface ConnectorPageProps {
  /**
   * The Used by tab's content, attached by another plugin to the MCP servers
   * sub-page's `usedBy` input. Without it the tab is left out.
   */
  usedBy?: ReactElement;
}

/**
 * One connector's page in the agent-platform shell: Tools (the index), Used
 * by, a family's Instances, Resources and Prompts when it exposes any, and
 * Details with its facts and technical details. `:server` names a server, a
 * server family or muster itself on the installation the address names (the
 * muster providers are pinned to it).
 *
 * Edit opens the connector wizard pre-filled
 * (`<installation>/<server>/edit`), the flow that added the
 * connector, the way agents and skills are edited. Where the
 * wizard cannot edit the connector — applied from Git, a family, no muster
 * session, settings the wizard cannot represent — Edit stays in place,
 * disabled, saying why.
 */
export function ConnectorPage({ usedBy }: ConnectorPageProps) {
  const { server: key = '' } = useParams();
  const { mcpServers } = useMusterInstance();
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);
  // What people read: the display name once the connector is read (a cached
  // row names it while it is read again), its URL name until then. `key`
  // stays what links, muster and the URL use.
  const shownName = useMemo(
    () =>
      row ? serverRowDisplayName(row, mcpServerDisplayNames(mcpServers)) : key,
    [row, mcpServers, key],
  );
  // Above every state the page can be in; the form an agent's page uses.
  return (
    <>
      <ShellDocumentTitle title={[shownName, 'Connectors']} />
      <ConnectorPageBody
        serverKey={key}
        row={row}
        shownName={shownName}
        usedBy={usedBy}
      />
    </>
  );
}

function ConnectorPageBody({
  serverKey: key,
  row,
  shownName,
  usedBy,
}: ConnectorPageProps & {
  serverKey: string;
  row: ServerPageRow | undefined;
  shownName: string;
}) {
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const { installation = '' } = useParams();
  const paths = useConnectorGroupPaths();
  // The sub-tab that lists the connector: known from a cached row (or for
  // muster) even while loading; otherwise the crumb has no link rather than
  // one to a sub-tab that does not list it.
  const listPath = paths.listOf(key, row);

  if (isLoadingInstallations || isLoading) {
    // The loaded page's frame from the first paint — trail, tile, badge row,
    // tab strip — with skeletons where the read will fill in
    // (T95). Tools is the one tab every connector has; the rest join it.
    return (
      <ShellPage
        title={shownName}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Connectors', href: listPath },
          { label: shownName },
        ]}
        leading={<ConnectorTile name={shownName} />}
        badges={<ShellPageBadgeSkeleton />}
        // Tools with its count's place held, so the tab keeps its width as
        // the page and then the tools land.
        tabs={[{ id: 'tools', path: '', title: 'Tools', count: 'loading' }]}
      >
        <LoadingIndicator label="Reading the environment's connectors…" />
      </ShellPage>
    );
  }
  if (!activeInstallation) {
    return (
      <ShellPage
        title={shownName}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Connectors', href: listPath },
          { label: shownName },
        ]}
      >
        <EmptyStateCard
          title="Environment not available"
          description={`Connectors on ${installation} cannot be read here. It may be turned off under Cluster access, or run no muster.`}
          actions={
            paths.connectors ? (
              <Link href={paths.connectors}>Back to connectors</Link>
            ) : undefined
          }
        />
      </ShellPage>
    );
  }
  if (!row) {
    return (
      <ShellPage
        title={key}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Connectors', href: listPath },
          { label: key },
        ]}
      >
        <EmptyStateCard
          title={`No connector “${key}” on ${activeInstallation}`}
          description="It may be on another environment, or removed."
          actions={
            paths.connectors ? (
              <Link href={paths.connectors}>Back to connectors</Link>
            ) : undefined
          }
        />
      </ShellPage>
    );
  }
  return (
    <ConnectorPageContent
      key={`${activeInstallation}/${key}`}
      row={row}
      displayName={shownName}
      servers={mcpServers}
      installation={activeInstallation}
      usedBy={usedBy}
    />
  );
}
