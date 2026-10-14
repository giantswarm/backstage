import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
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
  CopyButton,
  DisabledAction,
  EmptyStateCard,
  FactsColumn,
  LoadingIndicator,
  MoreActionsMenu,
  type MoreActionsMenuItem,
  RouteTabSpec,
  ShellDocumentTitle,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageFactsSkeleton,
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
import { mcpServersRouteRef, newMcpServerRouteRef } from '../../routes';
import { MUSTER_PAGE_DESCRIPTION } from '../../lib/connectorGroups';
import {
  familyGroups,
  findServerRow,
  fleetManagementClusters,
  partitionServers,
  ServerPageRow,
  serverRowKey,
} from '../../lib/serverGrouping';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { noToolsExplanation } from '../McpServersPage/serverDetail';
import { withEditParam } from '../NewMcpServerEditGate';
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
  runsAsCaller,
  signInLabel,
} from './connectorFacts';
import {
  ConnectorPageTarget,
  ConnectorPageTargetProvider,
} from './connectorPageTarget';
import { ConnectorToolsTab } from './ConnectorToolsTab';
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
  servers,
  installation,
  usedBy,
}: {
  row: ServerPageRow;
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
  const search = `?installation=${encodeURIComponent(installation)}`;
  const name = serverRowKey(row);
  const members = useMemo(() => rowServers(row), [row]);
  const representativeInfo = representativeServer(row, installation);
  const representative = representativeInfo?.server;
  const singular = row.kind === 'server' ? row.server : undefined;

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
    ? authActionParts(singular!.getName(), signIn, { noun: 'connector' })
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

  // Edit opens the connector wizard on this connector (`?edit=`), the flow
  // that added it; the wizard's edit gate seeds it from the server list.
  const editBlock = connectorEditBlock(row, authenticated);
  const newConnectorRoute = useRouteRef(newMcpServerRouteRef);
  const editHref =
    singular && !editBlock && newConnectorRoute
      ? withEditParam(newConnectorRoute(), singular.getName())
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
            label: `Turn off "${singular.getName()}"?`,
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
            label: `Turn on "${singular.getName()}"?`,
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
          label: `Remove "${singular.getName()}"?`,
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
    { id: 'tools', path: '', title: 'Tools', count: tools.tools?.length },
  ];
  for (const { capability, title, count, shown } of capabilities) {
    if (shown) {
      tabs.push({ id: capability, path: capability, title, count });
    }
  }
  if (usedBy && row.kind !== 'core') {
    tabs.push({ id: 'used-by', path: 'used-by', title: 'Used by' });
  }
  if (row.kind === 'family') {
    tabs.push({
      id: 'instances',
      path: 'instances',
      title: 'Instances',
      count: row.servers.length,
    });
  }

  const facts = [];
  if (representative) {
    facts.push({ label: 'Sign-in', value: signInLabel(representative) });
  }
  if (members.length > 0) {
    facts.push({ label: 'Health', value: healthLine(members) });
  }
  if (calls !== undefined) {
    facts.push({ label: 'Calls this month', value: calls });
  }
  const address = representative?.getUrl();
  if (address) {
    facts.push({
      label: 'Address',
      value: (
        <Text variant="body-small" style={{ wordBreak: 'break-all' }}>
          {address}
        </Text>
      ),
    });
  }
  const added = addedLine(members);
  if (added) {
    facts.push({ label: 'Added', value: added });
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: paths.customize },
    { label: 'Connectors', href: listPath },
    { label: name },
  ];

  const toIndex = <Navigate to={`${basePath}${search}`} replace />;
  // The removed Settings tab's address, kept for links and bookmarks: to the
  // edit it offered where the wizard can make it, to a family's instances it
  // listed, else to the connector itself.
  const settingsTarget =
    editHref ??
    (row.kind === 'family'
      ? `${basePath}/instances${search}`
      : `${basePath}${search}`);

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
        title={name}
        breadcrumbs={breadcrumbs}
        leading={<ConnectorTile name={name} />}
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
        tabsSearch={search}
        aside={
          facts.length > 0 ? (
            <FactsColumn facts={facts} aria-label="Connector details" />
          ) : undefined
        }
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
                  installation={installation}
                  tools={tools}
                  runsAsCaller={
                    representative ? runsAsCaller(representative) : false
                  }
                  emptyExplanation={emptyExplanation}
                  sessionGate={sessionGate}
                  signInGate={signInGate}
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
            {row.kind !== 'core' && (
              <Route
                path="settings"
                element={<Navigate to={settingsTarget} replace />}
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
                  title: `Connector "${singular.getName()}" removed`,
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
 * by, a family's Instances, and Resources and Prompts when it exposes any,
 * with its facts beside them. `:server` names a server, a server family or
 * muster itself on the installation the section's scope selects.
 *
 * Edit opens the connector wizard pre-filled (`new?edit=<name>`), the flow
 * that added the connector, the way agents and skills are edited; the old
 * `settings` tab address redirects there. Where the wizard cannot edit the
 * connector — applied from Git, a family, no muster session, settings the
 * wizard cannot represent — Edit stays in place, disabled, saying why.
 */
export function ConnectorPage({ usedBy }: ConnectorPageProps) {
  const { server: key = '' } = useParams();
  // Above every state the page can be in; the form an agent's page uses.
  return (
    <>
      <ShellDocumentTitle title={[key, 'Connectors']} />
      <ConnectorPageBody serverKey={key} usedBy={usedBy} />
    </>
  );
}

function ConnectorPageBody({
  serverKey: key,
  usedBy,
}: ConnectorPageProps & { serverKey: string }) {
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const paths = useConnectorGroupPaths();
  const { search } = useLocation();
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);
  // The sub-tab that lists the connector: known from a cached row (or for
  // muster) even while loading; otherwise the crumb has no link rather than
  // one to a sub-tab that does not list it.
  const listPath = paths.listOf(key, row);

  if (isLoadingInstallations || isLoading) {
    // The loaded page's frame from the first paint — trail, tile, badge row,
    // tab strip, facts column — with skeletons where the read will fill in
    // (T95). Tools is the one tab every connector has; the rest join it.
    return (
      <ShellPage
        title={key}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Connectors', href: listPath },
          { label: key },
        ]}
        leading={<ConnectorTile name={key} />}
        badges={<ShellPageBadgeSkeleton />}
        tabs={[{ id: 'tools', path: '', title: 'Tools' }]}
        tabsSearch={search}
        aside={<ShellPageFactsSkeleton />}
      >
        <LoadingIndicator label="Reading the environment's connectors…" />
      </ShellPage>
    );
  }
  if (!activeInstallation) {
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
          title="No muster environment"
          description="None of this portal's environments runs muster."
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
      servers={mcpServers}
      installation={activeInstallation}
      usedBy={usedBy}
    />
  );
}
