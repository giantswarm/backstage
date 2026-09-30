import { ReactNode, useMemo, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Content, EmptyState } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Link, Text } from '@backstage/ui';
import Edit from '@material-ui/icons/Edit';
import DeleteOutline from '@material-ui/icons/DeleteOutline';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Stop from '@material-ui/icons/Stop';
import Replay from '@material-ui/icons/Replay';
import {
  Breadcrumbs,
  LoadingIndicator,
  useProvidePageHeaderActions,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { useGitOpsSource } from '@giantswarm/backstage-plugin-flux-react';
import {
  MCPServer,
  mcpServerStateSeverity,
  worstSeverity,
  type MCPServerSeverity,
} from '../../lib/k8s';
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
} from '../McpServersPage/ServerMutationActions';
import { GitOpsEditDialog } from '../McpServersPage/GitOpsServerActions';
import {
  DEACTIVATED_SIGN_IN_GATE,
  SessionGate,
  ServerAuthActions,
  StateBadge,
  severityTone,
  useServerSignIn,
} from '../shared';
import { ServerPageTabs, ServerPageTabSpec } from './ServerPageTabs';
import { ServerOverviewTab } from './ServerOverviewTab';
import { ServerToolsTab } from './ServerToolsTab';
import { ServerCapabilityTab } from './ServerCapabilityTab';
import { ServerInstancesTab } from './ServerInstancesTab';
import { ServerHeaderActions, ServerMenuItem } from './ServerHeaderActions';
import {
  representativeServer,
  useCapabilityCounts,
  useServerTools,
} from './useServerPageData';

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
    const severity = mcpServerStateSeverity(row.server.getState());
    return (
      <StateBadge
        tone={severityTone(severity)}
        label={row.server.getState() ?? 'unknown'}
        title={row.server.getStateExplanation()}
      />
    );
  }
  if (row.kind === 'family') {
    const severities = row.servers.map(s =>
      mcpServerStateSeverity(s.getState()),
    );
    const healthy = severities.filter(s => s === 'ok').length;
    const worst = severities.reduce<MCPServerSeverity>(worstSeverity, 'ok');
    return (
      <StateBadge
        tone={severityTone(worst)}
        label={`${healthy} of ${row.servers.length} instances healthy`}
      />
    );
  }
  return null;
}

/**
 * The Edit/Remove dialog of a GitOps-managed server. Its own component so the
 * GitOps source lookup runs only for such a server.
 */
function GitOpsDialog({
  server,
  isOpen,
  onOpenChange,
}: {
  server: MCPServer;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const source = useGitOpsSource(server, server.cluster);
  return (
    <GitOpsEditDialog
      server={server}
      source={source}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    />
  );
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
  const tools = useServerTools(row, servers, installation, authenticated);
  const counts = useCapabilityCounts(
    installation,
    representative?.server.getName(),
    authenticated,
  );
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
      // Gated for an OAuth server waiting on a sign-in; the Overview says so.
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
      <Flex direction="column" gap="2">
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

  const tabs: ServerPageTabSpec[] = [
    { id: 'overview', path: '', title: 'Overview' },
    { id: 'tools', path: 'tools', title: 'Tools', count: tools.tools?.length },
    {
      id: 'resources',
      path: 'resources',
      title: 'Resources',
      count: counts.resourcesCount,
    },
    {
      id: 'prompts',
      path: 'prompts',
      title: 'Prompts',
      count: counts.promptsCount,
    },
  ];
  if (row.kind === 'family') {
    tabs.push({
      id: 'instances',
      path: 'instances',
      title: 'Instances',
      count: row.servers.length,
    });
  }

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
        {singular?.getUrl() && (
          <Text
            variant="body-small"
            color="secondary"
            style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
          >
            {singular.getUrl()}
          </Text>
        )}
      </Flex>

      <ServerPageTabs tabs={tabs} search={search} />

      <Routes>
        <Route
          index
          element={
            <ServerOverviewTab
              row={row}
              servers={servers}
              representative={representative}
              authenticated={authenticated}
            />
          }
        />
        <Route
          path="tools"
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
        <Route
          path="resources"
          element={
            <ServerCapabilityTab
              capability="resources"
              row={row}
              representative={representative}
              sessionGate={sessionGate}
            />
          }
        />
        <Route
          path="prompts"
          element={
            <ServerCapabilityTab
              capability="prompts"
              row={row}
              representative={representative}
              sessionGate={sessionGate}
            />
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
        <Route
          path="*"
          element={<Navigate to={`${basePath}${search}`} replace />}
        />
      </Routes>

      {singular && isGitOpsManaged(singular) && (
        <GitOpsDialog
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
          />
        </>
      )}
    </Flex>
  );
}

/**
 * One MCP server's page: Overview · Tools · Resources · Prompts, plus
 * Instances for a server family, with the server's actions in the page
 * header. `:server` names the row the servers list shows -- a family, a
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
