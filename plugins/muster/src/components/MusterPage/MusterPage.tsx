import { Header, Page, RoutedTabs } from '@backstage/core-components';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MusterDataProvider } from '../MusterDataProvider';
import { DashboardPage } from '../DashboardPage';
import { McpServersPage } from '../McpServersPage';
import { WorkflowsListPage } from '../WorkflowsListPage';
import { ToolExplorerPage } from '../ToolExplorerPage';
import {
  mcpServersRouteRef,
  toolExplorerRouteRef,
  workflowsRouteRef,
} from '../../routes';

/**
 * Top-level muster section: a Header plus tabbed navigation over the dashboard,
 * MCP-server manager, workflows, and tool explorer. CRD-backed tabs read
 * through the shared MusterDataProvider (multi-installation k8s fan-out);
 * MCP-backed tabs use the muster proxy.
 */
export function MusterPage() {
  const routes = [
    { path: '/', title: 'Dashboard', children: <DashboardPage /> },
    {
      path: mcpServersRouteRef.path,
      title: 'MCP servers',
      children: <McpServersPage />,
    },
    {
      path: workflowsRouteRef.path,
      title: 'Workflows',
      children: <WorkflowsListPage />,
    },
    {
      path: toolExplorerRouteRef.path,
      title: 'Tool explorer',
      children: <ToolExplorerPage />,
    },
  ];

  return (
    <Page themeId="tool">
      <Header
        title="Muster"
        subtitle="MCP aggregation, servers, and workflows"
        type="tool"
      />
      <ErrorsProvider>
        <MusterDataProvider>
          <RoutedTabs routes={routes} />
        </MusterDataProvider>
      </ErrorsProvider>
    </Page>
  );
}
