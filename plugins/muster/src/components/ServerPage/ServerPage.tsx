import { ReactNode, useMemo, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Content, EmptyState } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Link, Text } from '@backstage/ui';
import Edit from '@material-ui/icons/Edit';
import DeleteOutline from '@material-ui/icons/DeleteOutline';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Stop from '@material-ui/icons/Stop';
import Replay from '@material-ui/icons/Replay';
import {
  Breadcrumbs,
  LoadingIndicator,
  useProvidePageHeaderActions,
  RouteTabs,
  RouteTabSpec,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer } from '../../lib/k8s';
import { isGitOpsManaged } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import {
  ServerPageRow,
  familyGroups,
  findServerRow,
  fleetManagementClusters,
  partitionServers,
  serverRowKey,
} from '../../lib/serverGrouping';
import { mcpServersRouteRef, newMcpServerRouteRef } from '../../routes';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { withEditParam } from '../NewMcpServerEditGate';
import {
  AdHocServerDialog,
  ConfirmActionDialog,
  LiveAction,
  serverLiveActions,
} from './serverActions';
import { GitOpsEditDialog } from './GitOpsEditDialog';
import {
  DEACTIVATED_SIGN_IN_GATE,
  SessionGate,
  FamilyHealthBadge,
  ServerAuthActions,
  ServerStateBadge,
  useServerSignIn,
} from '../shared';
import { ServerDetailsTab } from './ServerDetailsTab';
import { ServerToolsTab } from './ServerToolsTab';
import { ServerCapabilityTab } from './ServerCapabilityTab';
import { ServerInstancesTab } from './ServerInstancesTab';
import { ServerHeaderActions, ServerMenuItem } from './ServerHeaderActions';
import { representativeServer, useServerTools } from './useServerPageData';
import { useServerCapabilityCounts } from '../McpServersPage/serverDetail';

/** The servers list, on the same installation. */
export function useServersListHref(installation: string | undefined) {
  const serversRoute = useRouteRef(mcpServersRouteRef);
  if (!serversRoute) {
    return undefined;
  }
  return installation
    ? `${serversRoute()}?installation=${encodeURIComponent(installation)}`
    : serversRoute();
}

/** How a row reads above its page title: what kind of server it is. */
function kindLabel(row: ServerPageRow): string {
  switch (row.kind) {
    case 'family':
      return 'Server family';
    case 'server':
      return isGitOpsManaged(row.server)
        ? 'Fleet server'
        : 'User-registered server';
    default:
      return 'muster (core tools)';
  }
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

function ServerPageContent({
  row,
  servers,
  installation,
  listHref,
}: {
  row: ServerPageRow;
  servers: MCPServer[];
  installation: string;
  listHref?: string;
}) {
  const session = useMusterSession();
  const { authenticated } = session;
  const serverKey = serverRowKey(row);
  const basePath = useSplatBasePath();
  const search = `?installation=${encodeURIComponent(installation)}`;

  const representative = representativeServer(row, installation);
  const { search: currentSearch } = useLocation();
  const tools = useServerTools(row, servers, installation, {
    enabled: authenticated,
  });
  const counts = useServerCapabilityCounts(representative?.server, {
    enabled: authenticated,
  });
  const fleetClusters = useMemo(
    () => fleetManagementClusters(familyGroups(partitionServers(servers))),
    [servers],
  );

  const singular = row.kind === 'server' ? row.server : undefined;
  const canSignIn = Boolean(
    singular && authenticated && singular.canAuthenticateInteractively(),
  );
  const signInState = useServerSignIn(
    singular?.getName() ?? '',
    canSignIn ? installation : undefined,
  );
  // The header renders outside this page's providers, so its buttons call the
  // latest sign-in state through a ref rather than holding a stale closure.
  const signInRef = useRef(signInState);
  signInRef.current = signInState;
  const needsSignIn =
    canSignIn &&
    !singular!.getSuspended() &&
    !signInState.isSsoManaged &&
    (signInState.needsLogin || signInState.isWaiting);
  const canSignOut =
    canSignIn &&
    !signInState.isSsoManaged &&
    singular!.getAuth()?.type === 'oauth' &&
    signInState.isConnected;
  const signInPending = signInState.isPending || signInState.isWaiting;

  const [action, setAction] = useState<LiveAction | undefined>();
  const [actionOpen, setActionOpen] = useState(false);
  const [jsonEditOpen, setJsonEditOpen] = useState(false);
  const [gitOpsOpen, setGitOpsOpen] = useState(false);
  const navigate = useNavigate();
  const registerLink = useRouteRef(newMcpServerRouteRef);

  const headerActions = useMemo(() => {
    const menuItems: ServerMenuItem[] = [];
    let primary:
      { label: string; onPress: () => void; icon?: JSX.Element } | undefined;
    const openAction = (next: LiveAction) => {
      setAction(next);
      setActionOpen(true);
    };

    if (singular && isGitOpsManaged(singular)) {
      primary = {
        label: 'Edit/Remove',
        icon: <Edit fontSize="inherit" />,
        onPress: () => setGitOpsOpen(true),
      };
    } else if (singular && authenticated) {
      const name = singular.getName();
      primary = wizardEditBlocker(singular)
        ? {
            label: 'Edit as JSON',
            icon: <Edit fontSize="inherit" />,
            onPress: () => setJsonEditOpen(true),
          }
        : {
            label: 'Edit',
            icon: <Edit fontSize="inherit" />,
            onPress: () => {
              if (registerLink) {
                navigate(withEditParam(registerLink(), name));
              }
            },
          };
      const live = serverLiveActions(singular);
      if (live.activate) {
        const activate = live.activate;
        menuItems.push({
          id: 'activate',
          label: 'Activate…',
          icon: <PlayArrow fontSize="inherit" />,
          onAction: () => openAction(activate),
        });
      }
      if (live.deactivate) {
        const deactivate = live.deactivate;
        menuItems.push({
          id: 'deactivate',
          label: 'Deactivate…',
          icon: <Stop fontSize="inherit" />,
          onAction: () => openAction(deactivate),
        });
      }
      // Gated for an OAuth server waiting on a sign-in; the Details tab says so.
      if (live.reconnect && !live.reconnectGate) {
        const reconnect = live.reconnect;
        menuItems.push({
          id: 'reconnect',
          label: 'Reconnect…',
          icon: <Replay fontSize="inherit" />,
          onAction: () => openAction(reconnect),
        });
      }
      menuItems.push({
        id: 'delete',
        label: 'Delete…',
        icon: <DeleteOutline fontSize="inherit" />,
        danger: true,
        onAction: () => openAction(live.remove),
      });
    }
    if (canSignOut) {
      menuItems.push({
        id: 'sign-out',
        label: 'Sign out',
        onAction: () => signInRef.current.signOut(),
      });
    }

    const signIn = needsSignIn
      ? {
          onPress: () => signInRef.current.signIn(),
          isPending: signInPending,
        }
      : undefined;
    if (!signIn && !primary && menuItems.length === 0) {
      return null;
    }
    return (
      <ServerHeaderActions
        signIn={signIn}
        primary={primary}
        menuItems={menuItems}
      />
    );
  }, [
    singular,
    authenticated,
    canSignOut,
    needsSignIn,
    signInPending,
    navigate,
    registerLink,
  ]);
  useProvidePageHeaderActions(headerActions);

  const sessionGate: ReactNode = authenticated ? undefined : (
    <SessionGate
      session={session}
      installation={installation}
      context="Tools, resources and prompts are read through the muster session."
    />
  );
  const signInGate: ReactNode =
    singular && canSignIn && signInState.needsLogin ? (
      <Flex direction="column" gap="2" align="start">
        <Text as="p" variant="body-medium">
          Your muster session is not signed in to this server, so its tools are
          hidden.
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

  // Tools leads and is the index: what a server offers is what a person
  // comes to it for, so a server link lands there. A family's instances come
  // next; Resources and Prompts only when the server exposes any (most expose
  // neither). Details closes the row.
  const hasResources = (counts.resourcesCount ?? 0) > 0;
  const hasPrompts = (counts.promptsCount ?? 0) > 0;
  const tabs: RouteTabSpec[] = [
    { id: 'tools', path: '', title: 'Tools', count: tools.tools?.length },
  ];
  if (row.kind === 'family') {
    tabs.push({
      id: 'instances',
      path: 'instances',
      title: 'Instances',
      count: row.servers.length,
    });
  }
  if (hasResources) {
    tabs.push({
      id: 'resources',
      path: 'resources',
      title: 'Resources',
      count: counts.resourcesCount,
    });
  }
  if (hasPrompts) {
    tabs.push({
      id: 'prompts',
      path: 'prompts',
      title: 'Prompts',
      count: counts.promptsCount,
    });
  }
  tabs.push({ id: 'details', path: 'details', title: 'Details' });

  const toIndex = <Navigate to={`${basePath}${search}`} replace />;

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="2">
        <Breadcrumbs
          items={[
            { label: 'MCP Servers', href: listHref },
            { label: serverKey },
          ]}
        />
        <Text variant="body-small" color="secondary">
          {kindLabel(row)}
        </Text>
        <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
          <Text as="h2" variant="title-medium">
            {serverKey}
          </Text>
          <StatusBadge row={row} />
        </Flex>
      </Flex>

      {/* What the header's Sign in / Sign out answered. The header renders
          outside this page's providers and shows only the pending state, so
          a refusal, a note, or the URL of a sign-in page the browser blocked
          from opening is said here, on every tab. */}
      {canSignIn && signInState.error && (
        <Alert status="danger" description={signInState.error} />
      )}
      {canSignIn && signInState.note && (
        <Alert status="info" description={signInState.note} />
      )}
      {canSignIn &&
        signInState.isWaiting &&
        signInState.authUrl &&
        !signInState.signInTabOpened && (
          <Alert
            status="warning"
            description={
              <>
                The browser blocked the sign-in page.{' '}
                <Link
                  href={signInState.authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the sign-in page
                </Link>
              </>
            }
          />
        )}

      <RouteTabs tabs={tabs} search={search} />

      <Routes>
        <Route
          index
          element={
            <ServerToolsTab
              row={row}
              serverKey={serverKey}
              installation={installation}
              tools={tools}
              sessionGate={sessionGate}
              signInGate={signInGate}
            />
          }
        />
        {/* Where Tools lived before it became the index; the query string
            (`?installation=`, a `?q=` filter) comes along. */}
        <Route
          path="tools"
          element={
            <Navigate
              to={{ pathname: basePath, search: currentSearch }}
              replace
            />
          }
        />
        {/* Details' path while it was named Overview. */}
        <Route
          path="overview"
          element={<Navigate to={`${basePath}/details${search}`} replace />}
        />
        <Route
          path="details"
          element={
            <ServerDetailsTab
              row={row}
              servers={servers}
              representative={representative}
              authenticated={authenticated}
            />
          }
        />
        {/* Without the counts yet (or a session) the tab renders its own
            loading or session state; once they say there is nothing, the
            tab has no place in the row, so a link to it lands on Tools. */}
        <Route
          path="resources"
          element={
            counts.isLoaded && !hasResources ? (
              toIndex
            ) : (
              <ServerCapabilityTab
                capability="resources"
                row={row}
                representative={representative}
                sessionGate={sessionGate}
              />
            )
          }
        />
        <Route
          path="prompts"
          element={
            counts.isLoaded && !hasPrompts ? (
              toIndex
            ) : (
              <ServerCapabilityTab
                capability="prompts"
                row={row}
                representative={representative}
                sessionGate={sessionGate}
              />
            )
          }
        />
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
        <Route path="*" element={toIndex} />
      </Routes>

      {singular && isGitOpsManaged(singular) && (
        <GitOpsEditDialog
          server={singular}
          isOpen={gitOpsOpen}
          onOpenChange={setGitOpsOpen}
        />
      )}
      {singular && !isGitOpsManaged(singular) && (
        <>
          {wizardEditBlocker(singular) && (
            <AdHocServerDialog
              server={singular}
              open={jsonEditOpen}
              onClose={() => setJsonEditOpen(false)}
            />
          )}
          <ConfirmActionDialog
            server={singular}
            action={action}
            open={actionOpen}
            onClose={() => setActionOpen(false)}
            // A deleted server has no page left to show: back to the list,
            // where its absence is the confirmation.
            onDone={done => {
              if (done.destructive && listHref) {
                navigate(listHref);
              }
            }}
          />
        </>
      )}
    </Flex>
  );
}

/**
 * One MCP server's page: Tools (the index), Instances for a server family,
 * Resources and Prompts when it exposes any, and Details, with the server's
 * actions in the page header. `:server` names the row the servers list shows -- a family, a
 * singular server or muster itself -- on the installation the section's scope
 * selects (`?installation=` first); switching the installation shows the same
 * server there, or says it does not exist there.
 */
export function ServerPage() {
  const { server: key = '' } = useParams();
  const { mcpServers, activeInstallation, isLoading, isLoadingInstallations } =
    useMusterInstance();
  const listHref = useServersListHref(activeInstallation);
  const row = useMemo(() => findServerRow(mcpServers, key), [mcpServers, key]);

  let body: ReactNode;
  if (isLoadingInstallations || isLoading) {
    body = <LoadingIndicator label="Reading the installation's MCP servers…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyState
        missing="data"
        title="No muster installation"
        description="None of the installations this portal knows runs muster, so there are no aggregated MCP servers to show."
      />
    );
  } else if (!row) {
    body = (
      <EmptyState
        missing="data"
        title={`No server “${key}” on ${activeInstallation}`}
        description={`The installation ${activeInstallation} has no MCP server or server family named “${key}”. It may run on another installation — pick it in the page header — or it may have been removed.`}
        action={
          listHref ? (
            <Link href={listHref}>Back to the MCP servers</Link>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <ServerPageContent
        // A fresh page per server and installation: dialog and filter state
        // must not carry over to a different server.
        key={`${activeInstallation}/${key}`}
        row={row}
        servers={mcpServers}
        installation={activeInstallation}
        listHref={listHref}
      />
    );
  }

  return (
    <Content>
      <ActiveInstallationNote />
      {body}
    </Content>
  );
}
