import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { EmptyState } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  ButtonIcon,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useQuery } from '@tanstack/react-query';
import Edit from '@material-ui/icons/Edit';
import MoreHoriz from '@material-ui/icons/MoreHoriz';
import {
  BreadcrumbItem,
  FactsColumn,
  LoadingIndicator,
  MENU_WIDTH,
  RouteTabSpec,
  ShellPage,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { isGitOpsManaged } from '../../lib/gitops';
import { isReadOnly } from '../../lib/toolAnnotations';
import { serverPageResolver } from '../../lib/toolGrouping';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
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
import {
  ConfirmActionDialog,
  LiveAction,
  serverLiveActions,
} from '../ServerPage/serverActions';
import { ServerCapabilityTab } from '../ServerPage/ServerCapabilityTab';
import {
  representativeServer,
  useServerTools,
} from '../ServerPage/useServerPageData';
import { useServerCapabilityCounts } from '../McpServersPage/serverDetail';
import {
  DEACTIVATED_SIGN_IN_GATE,
  FamilyHealthBadge,
  ServerAuthActions,
  ServerStateBadge,
  SessionGate,
  useServerSignIn,
} from '../shared';
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
import { ConnectorSettingsTab } from './ConnectorSettingsTab';

/** The shell's Customize page and its Connectors tab, where the app binds them. */
function useCustomizePaths(): {
  customize?: string;
  connectors?: string;
} {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  return {
    customize,
    connectors: customize ? `${customize}/connectors` : undefined,
  };
}

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

function ConnectorTile({ name }: { name: string }) {
  const classes = useStyles();
  return (
    <span className={classes.tile} aria-hidden>
      {name.charAt(0)}
    </span>
  );
}

function StatusBadge({ row }: { row: ServerPageRow }) {
  if (row.kind === 'server') {
    return <ServerStateBadge server={row.server} />;
  }
  if (row.kind === 'family') {
    return <FamilyHealthBadge instances={row.servers} />;
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

type MenuEntry = {
  id: string;
  label: string;
  danger?: boolean;
  onAction: () => void;
};

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
  const basePath = useSplatBasePath();
  const paths = useCustomizePaths();
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

  const canSignIn = Boolean(
    singular && authenticated && singular.canAuthenticateInteractively(),
  );
  const signIn = useServerSignIn(
    singular?.getName() ?? '',
    canSignIn ? installation : undefined,
  );
  const needsSignIn =
    canSignIn &&
    !singular!.getSuspended() &&
    !signIn.isSsoManaged &&
    (signIn.needsLogin || signIn.isWaiting);
  const canSignOut =
    canSignIn &&
    !signIn.isSsoManaged &&
    singular!.getAuth()?.type === 'oauth' &&
    signIn.isConnected;

  const [action, setAction] = useState<LiveAction | undefined>();
  const [actionOpen, setActionOpen] = useState(false);
  const openAction = (next: LiveAction) => {
    setAction(next);
    setActionOpen(true);
  };

  const menu: MenuEntry[] = [];
  if (singular && authenticated && !isGitOpsManaged(singular)) {
    const live = serverLiveActions(singular);
    if (live.reconnect && !live.reconnectGate) {
      const reconnect = live.reconnect;
      menu.push({
        id: 'reconnect',
        label: 'Reconnect…',
        onAction: () => openAction(reconnect),
      });
    }
    if (canSignOut) {
      menu.push({
        id: 'sign-out',
        label: 'Sign out',
        onAction: () => signIn.signOut(),
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
            label: `Turn off ${singular.getName()}`,
          }),
      });
    }
    if (live.activate) {
      const activate = live.activate;
      menu.push({
        id: 'turn-on',
        label: 'Turn on…',
        onAction: () =>
          openAction({ ...activate, label: `Turn on ${singular.getName()}` }),
      });
    }
    menu.push({
      id: 'remove',
      label: 'Remove…',
      danger: true,
      onAction: () =>
        openAction({ ...live.remove, label: `Remove ${singular.getName()}` }),
    });
  } else if (canSignOut) {
    menu.push({
      id: 'sign-out',
      label: 'Sign out',
      onAction: () => signIn.signOut(),
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
      context="A connector's tools are read through your muster session."
    />
  );
  const signInGate: ReactNode =
    singular && canSignIn && signIn.needsLogin ? (
      <Flex direction="column" gap="2" align="start">
        <Text as="p" variant="body-medium">
          You are not signed in to this connector, so its tools are hidden.
        </Text>
        <ServerAuthActions
          serverName={singular.getName()}
          installation={installation}
          oauthConfigured={singular.getAuth()?.type === 'oauth'}
          signInGate={
            singular.getSuspended() ? DEACTIVATED_SIGN_IN_GATE : undefined
          }
        />
      </Flex>
    ) : undefined;

  const emptyExplanation = singular
    ? noToolsExplanation(singular)
    : 'No instance of this connector offers tools right now.';

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
  if (row.kind !== 'core') {
    tabs.push({ id: 'settings', path: 'settings', title: 'Settings' });
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
    { label: 'Connectors', href: paths.connectors },
    { label: name },
  ];

  const toIndex = <Navigate to={`${basePath}${search}`} replace />;

  return (
    <ConnectorPageTargetProvider target={target}>
      <ShellPage
        title={name}
        breadcrumbs={breadcrumbs}
        leading={<ConnectorTile name={name} />}
        badges={<StatusBadge row={row} />}
        meta={representative?.getDescription()}
        actions={
          <>
            {needsSignIn && (
              <Button
                variant="primary"
                isPending={signIn.isPending || signIn.isWaiting}
                onPress={() => signIn.signIn()}
              >
                Sign in
              </Button>
            )}
            {row.kind !== 'core' && (
              <Button
                variant="secondary"
                iconStart={<Edit fontSize="inherit" />}
                onPress={() => navigate(`${basePath}/settings${search}`)}
              >
                Edit
              </Button>
            )}
          </>
        }
        menu={
          menu.length > 0 ? (
            <MenuTrigger>
              <ButtonIcon
                icon={<MoreHoriz />}
                aria-label="More actions"
                variant="tertiary"
              />
              <Menu maxWidth={MENU_WIDTH}>
                {menu.map(item => (
                  <MenuItem
                    key={item.id}
                    id={item.id}
                    color={item.danger ? 'danger' : undefined}
                    onAction={item.onAction}
                  >
                    {item.label}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
          ) : undefined
        }
        tabs={tabs}
        tabsSearch={search}
        aside={
          facts.length > 0 ? (
            <FactsColumn facts={facts} aria-label="Connector details" />
          ) : undefined
        }
      >
        <Flex direction="column" gap="3">
          {canSignIn && signIn.error && (
            <Alert status="danger" description={signIn.error} />
          )}
          {canSignIn && signIn.note && (
            <Alert status="info" description={signIn.note} />
          )}
          {canSignIn &&
            signIn.isWaiting &&
            signIn.authUrl &&
            !signIn.signInTabOpened && (
              <Alert
                status="warning"
                description={
                  <>
                    The browser blocked the sign-in page.{' '}
                    <Link
                      href={signIn.authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open the sign-in page
                    </Link>
                  </>
                }
              />
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
            {row.kind !== 'core' && (
              <Route
                path="settings"
                element={
                  <ConnectorSettingsTab
                    row={row}
                    representative={representative}
                    fleetClusters={fleetClusters}
                    authenticated={authenticated}
                  />
                }
              />
            )}
            <Route path="*" element={toIndex} />
          </Routes>
        </Flex>
        {singular && !isGitOpsManaged(singular) && (
          <ConfirmActionDialog
            server={singular}
            action={action}
            open={actionOpen}
            onClose={() => setActionOpen(false)}
            onDone={done => {
              const away = paths.connectors ?? serversRoute?.();
              if (done.destructive && away) {
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
 * by, Settings, and Resources and Prompts when it exposes any, with its
 * facts beside them. `:server` names a server, a server family or muster
 * itself on the installation the section's scope selects.
 */
export function ConnectorPage({ usedBy }: ConnectorPageProps) {
  const { server: key = '' } = useParams();
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const paths = useCustomizePaths();
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);

  if (isLoadingInstallations || isLoading) {
    return (
      <ShellPage title={key}>
        <LoadingIndicator label="Reading the installation's connectors…" />
      </ShellPage>
    );
  }
  if (!activeInstallation) {
    return (
      <ShellPage title={key}>
        <EmptyState
          missing="data"
          title="No muster installation"
          description="None of the installations this portal knows runs muster, so there are no connectors to show."
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
          { label: 'Connectors', href: paths.connectors },
          { label: key },
        ]}
      >
        <EmptyState
          missing="data"
          title={`No connector “${key}” on ${activeInstallation}`}
          description="It may run on another installation, or it may have been removed."
          action={
            paths.connectors ? (
              <Link href={paths.connectors}>Back to the connectors</Link>
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
