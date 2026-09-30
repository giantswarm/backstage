import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import {
  DetailsPane,
  useDetailsPane,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer, mcpServerStateSeverity } from '../../../lib/k8s';
import { formatRelativeTime } from '../../../lib/formatRelativeTime';
import {
  AuthChain,
  DetailBlock,
  HealthDetails,
  ServerConfig,
} from '../../McpServersPage/serverDetail';
import {
  DEACTIVATED_SIGN_IN_GATE,
  ServerAuthActions,
  ServerStateBadge,
} from '../../shared';

export const INSTANCE_PANE_ID = 'mcp-server-instance';

type InstanceRow = { id: string; server: MCPServer };

const SEVERITY_ORDER = { error: 0, warning: 1, unknown: 2, ok: 3 } as const;

/** The unhealthy instances first, the reason to open this tab at all. */
function byHealthThenName(a: MCPServer, b: MCPServer) {
  return (
    SEVERITY_ORDER[mcpServerStateSeverity(a.getState())] -
      SEVERITY_ORDER[mcpServerStateSeverity(b.getState())] ||
    a.getName().localeCompare(b.getName())
  );
}

/** The link that opens an instance in the drawer, keeping `?installation=`. */
function useInstanceHref() {
  const { pathname } = useLocation();
  const { getRoute } = useDetailsPane(INSTANCE_PANE_ID);
  return (server: MCPServer) =>
    getRoute(
      pathname,
      {
        cluster: server.cluster,
        kind: 'MCPServer',
        namespace: server.getNamespace(),
        name: server.getName(),
      },
      { keepSearch: true },
    );
}

/** "Missing from: walrus. Present on 26 of 27 management clusters." */
function coverageLine(clusters: string[], fleet: string[]): string {
  const present = new Set(clusters);
  const missing = fleet.filter(mc => !present.has(mc));
  const total = fleet.length;
  if (missing.length === 0) {
    return `Present on all ${total} management ${total === 1 ? 'cluster' : 'clusters'}.`;
  }
  return `Missing from: ${missing.join(', ')}. Present on ${present.size} of ${total} management clusters.`;
}

export interface ServerInstancesTabProps {
  instances: MCPServer[];
  /**
   * Every management cluster the installation's families reach, the fleet the
   * coverage line measures against.
   */
  fleetClusters: string[];
  authenticated: boolean;
}

/**
 * A family's instances, one row each: the value callers pass for the family's
 * instance argument, its health, when it last connected, its last error. When
 * the instances carry the management-cluster label -- a Giant Swarm
 * convention muster itself does not know -- the table adds that column and a
 * coverage line; a family distributed over anything else does not pretend its
 * instances are clusters. A row opens the instance in the side drawer, where a
 * per-instance sign-in lives.
 */
export function ServerInstancesTab({
  instances,
  fleetClusters,
  authenticated,
}: ServerInstancesTabProps) {
  const instanceHref = useInstanceHref();
  const instanceArg = instances[0]?.getInstanceArg();
  const clusters = instances
    .map(s => s.getManagementCluster())
    .filter((mc): mc is string => Boolean(mc));
  const byCluster = clusters.length > 0;

  const data = useMemo<InstanceRow[]>(
    () =>
      [...instances]
        .sort(byHealthThenName)
        .map(server => ({ id: server.getName(), server })),
    [instances],
  );

  const columns: ColumnConfig<InstanceRow>[] = [
    {
      id: 'instance',
      label: 'Instance',
      isRowHeader: true,
      cell: row => (
        <CellText
          title={row.server.getName()}
          href={instanceHref(row.server)}
        />
      ),
    },
  ];
  if (byCluster) {
    columns.push({
      id: 'cluster',
      label: 'Management cluster',
      cell: row => (
        <CellText title={row.server.getManagementCluster() ?? '—'} />
      ),
    });
  }
  columns.push(
    {
      id: 'status',
      label: 'Status',
      cell: row => (
        <Cell>
          <ServerStateBadge server={row.server} />
        </Cell>
      ),
    },
    {
      id: 'lastConnected',
      label: 'Last connected',
      cell: row => {
        const last = row.server.getLastConnected();
        return <CellText title={(last && formatRelativeTime(last)) || '—'} />;
      },
    },
    {
      id: 'lastError',
      label: 'Last error',
      cell: row => (
        <Cell>
          <Text
            variant="body-small"
            color="secondary"
            truncate
            title={row.server.getLastError()}
            style={{ maxWidth: 360, display: 'block' }}
          >
            {row.server.getLastError() ?? '—'}
          </Text>
        </Cell>
      ),
    },
  );

  const { tableProps } = useTable<InstanceRow>({
    mode: 'complete',
    data,
    paginationOptions: { type: 'none' },
  });

  return (
    <Flex direction="column" gap="3">
      {instanceArg && (
        <Text as="p" variant="body-medium">
          Callers choose an instance with <code>{instanceArg}</code>.
        </Text>
      )}
      {byCluster && (
        <Text as="p" variant="body-small" color="secondary">
          {coverageLine(clusters, fleetClusters)}
        </Text>
      )}
      <Table<InstanceRow> {...tableProps} columnConfig={columns} />
      <DetailsPane
        paneId={INSTANCE_PANE_ID}
        title={({ name }) => name}
        render={({ name }) => {
          const server = instances.find(s => s.getName() === name);
          if (!server) {
            return (
              <Text as="p" variant="body-medium" color="secondary">
                No instance named {name} in this family.
              </Text>
            );
          }
          return (
            <Flex direction="column" gap="2">
              <Flex align="center" gap="2">
                <ServerStateBadge server={server} />
              </Flex>
              {authenticated && server.canAuthenticateInteractively() && (
                <Flex direction="column" align="start">
                  <ServerAuthActions
                    serverName={server.getName()}
                    installation={server.cluster}
                    oauthConfigured={server.getAuth()?.type === 'oauth'}
                    signInGate={
                      server.getSuspended()
                        ? DEACTIVATED_SIGN_IN_GATE
                        : undefined
                    }
                  />
                </Flex>
              )}
              <DetailBlock title="Configuration">
                <ServerConfig server={server} />
              </DetailBlock>
              <DetailBlock title="Health">
                <HealthDetails server={server} />
              </DetailBlock>
              <DetailBlock title="Authentication">
                <AuthChain server={server} />
              </DetailBlock>
            </Flex>
          );
        }}
      />
    </Flex>
  );
}
