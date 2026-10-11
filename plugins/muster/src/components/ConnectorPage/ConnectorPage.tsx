import { ReactElement, ReactNode, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
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
import {
  customizeExternalRouteRef,
  mcpServersRouteRef,
  newMcpServerRouteRef,
} from '../../routes';
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
import { GitOpsEditDialog } from '../ServerPage/GitOpsEditDialog';
import { ServerCapabilityTab } from '../ServerPage/ServerCapabilityTab';
import { ServerInstancesTab } from '../ServerPage/ServerInstancesTab';
import {
  representativeServer,
  useServerTools,
} from '../ServerPage/useServerPageData';
import { useServerCapabilityCounts } from '../McpServersPage/serverDetail';
import {
  deactivatedSignInGate,
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
import { connectorEditBlock, SESSION_ACTIONS_REASON } from './connectorEdit';
import { DisabledAction } from './DisabledAction';

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

  const menu: MenuEntry[] = [];
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
    { label: 'Connectors', href: paths.connectors },
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
  const editIcon = <Edit fontSize="inherit" />;
  let editAction: ReactNode;
  if (row.kind !== 'core') {
    editAction = editHref ? (
      <Button
        variant="secondary"
        iconStart={editIcon}
        onPress={() => navigate(editHref)}
      >
        Edit
      </Button>
    ) : (
      <DisabledAction
        reason={
          editBlock?.reason ?? 'The connector wizard is not available here.'
        }
      >
        {describedBy => (
          <Button
            variant="secondary"
            iconStart={editIcon}
            isDisabled
            aria-describedby={describedBy}
          >
            Edit
          </Button>
        )}
      </DisabledAction>
    );
  }
  const moreIcon = <MoreHoriz />;
  let menuAction: ReactNode;
  if (menu.length > 0) {
    menuAction = (
      <MenuTrigger>
        <ButtonIcon
          icon={moreIcon}
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
    );
  } else if (singular) {
    // Only without a muster session: every action runs through it.
    menuAction = (
      <DisabledAction reason={SESSION_ACTIONS_REASON}>
        {describedBy => (
          <ButtonIcon
            icon={moreIcon}
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
        meta={representative?.getDescription()}
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
            server={singular}
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
      <Helmet title={`${key} · Connectors · Agent Platform`} />
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
  const paths = useCustomizePaths();
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);

  if (isLoadingInstallations || isLoading) {
    return (
      <ShellPage title={key}>
        <LoadingIndicator label="Reading the environment's connectors…" />
      </ShellPage>
    );
  }
  if (!activeInstallation) {
    return (
      <ShellPage title={key}>
        <EmptyState
          missing="data"
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
          { label: 'Connectors', href: paths.connectors },
          { label: key },
        ]}
      >
        <EmptyState
          missing="data"
          title={`No connector “${key}” on ${activeInstallation}`}
          description="It may be on another environment, or removed."
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
