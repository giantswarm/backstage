import { ReactNode } from 'react';
import {
  Content,
  EmptyState,
  Link,
  Progress,
  StatusAborted,
  StatusError,
  StatusOK,
  StatusPending,
  StatusWarning,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Chip, Typography } from '@material-ui/core';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterData } from '../MusterDataProvider';
import {
  MCPServer,
  MCPServerAuth,
  mcpServerStateSeverity,
} from '../../lib/k8s';
import { ServerDetailPanel } from './ServerDetailPanel';

/** Flat, table-friendly projection of an MCPServer CR (kept alongside the CR). */
interface ServerRow {
  id: string;
  name: string;
  family: string;
  managementCluster: string;
  installation: string;
  type: string;
  state: string;
  lastConnected: string;
  autoStart: string;
  authType: string;
  server: MCPServer;
}

/** A short label describing the auth posture from spec.auth. */
function authLabel(auth?: MCPServerAuth): string {
  if (!auth || auth.type === undefined || auth.type === 'none') {
    return 'none';
  }
  if (auth.tokenExchange?.enabled) {
    return 'oauth (token exchange)';
  }
  if (auth.localMint?.enabled) {
    return 'oauth (local mint)';
  }
  if (auth.forwardToken) {
    return 'oauth (forward)';
  }
  return auth.type;
}

function stateBadge(state: string): ReactNode {
  if (!state) {
    return <StatusAborted>unknown</StatusAborted>;
  }
  switch (mcpServerStateSeverity(state as never)) {
    case 'ok':
      return <StatusOK>{state}</StatusOK>;
    case 'error':
      return <StatusError>{state}</StatusError>;
    case 'warning':
      return <StatusWarning>{state}</StatusWarning>;
    default:
      return <StatusPending>{state}</StatusPending>;
  }
}

function toRow(server: MCPServer): ServerRow {
  const lastConnected = server.getLastConnected();
  return {
    id: `${server.cluster}/${server.getName()}`,
    name: server.getName(),
    family: server.getFamily() ?? '-',
    managementCluster: server.getManagementCluster() ?? '-',
    installation: server.cluster,
    type: server.getType() ?? '-',
    state: server.getState() ?? '',
    lastConnected: lastConnected
      ? new Date(lastConnected).toLocaleString()
      : '-',
    autoStart: server.getAutoStart() ? 'yes' : 'no',
    authType: authLabel(server.getAuth()),
    server,
  };
}

export function McpServersPage() {
  const { mcpServers, activeInstallations, isLoading } = useMusterData();

  const columns: TableColumn<ServerRow>[] = [
    { title: 'Name', field: 'name', highlight: true },
    { title: 'Family', field: 'family' },
    {
      title: 'Target MC',
      field: 'managementCluster',
      defaultGroupOrder: 0,
    },
    { title: 'Installation', field: 'installation' },
    { title: 'Type', field: 'type' },
    {
      title: 'State',
      field: 'state',
      render: row => stateBadge(row.state),
    },
    { title: 'Last connected', field: 'lastConnected' },
    { title: 'Auto start', field: 'autoStart' },
    {
      title: 'Auth',
      field: 'authType',
      render: row => <Chip size="small" label={row.authType} />,
    },
  ];

  let body: ReactNode;
  if (isLoading) {
    body = <Progress />;
  } else if (activeInstallations.length === 0) {
    body = (
      <EmptyState
        missing="data"
        title="Select an installation"
        description="Choose one or more muster installations above to list their aggregated MCP servers."
      />
    );
  } else {
    const rows = mcpServers.map(toRow);
    body = (
      <Table<ServerRow>
        title={
          <Typography variant="h6">MCP servers ({rows.length})</Typography>
        }
        columns={columns}
        data={rows}
        style={{ width: '100%' }}
        options={{
          grouping: true,
          paging: rows.length > 50,
          pageSize: 50,
          pageSizeOptions: [25, 50, 100],
          emptyRowsWhenPaging: false,
          actionsColumnIndex: -1,
        }}
        detailPanel={({ rowData }) => (
          <ServerDetailPanel server={rowData.server} />
        )}
        emptyContent={
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ padding: 16 }}
          >
            No MCPServer CRs found in the selected installation(s). The muster
            CRDs may not be installed there.
          </Typography>
        }
      />
    );
  }

  return (
    <Content>
      <InstallationPicker />
      {body}
      <Typography variant="caption" color="textSecondary">
        Read-only view of muster MCPServer CRs.{' '}
        <Link to="https://github.com/giantswarm/muster">muster docs</Link>
      </Typography>
    </Content>
  );
}
