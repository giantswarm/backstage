import {
  ApiBlueprint,
  configApiRef,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import AccountTreeIcon from '@material-ui/icons/AccountTree';

import {
  musterApiRef,
  MusterApiClient,
  MusterAuthProviders,
  musterAuthProvidersApiRef,
} from './apis';
import {
  mcpServersRouteRef,
  rootRouteRef,
  toolExplorerRouteRef,
  workflowDetailRouteRef,
  workflowsRouteRef,
} from './routes';

// The muster section is a page with sub-page tabs: with no loader of its own,
// PageBlueprint renders the attached sub-pages as tabs in the BUI plugin
// header (the same pattern as the flux section's list/tree tabs). Each tab is
// wrapped in MusterProviders so they share one muster instance + session.
const musterPage = PageBlueprint.make({
  params: {
    title: 'MCP Servers',
    icon: <AccountTreeIcon />,
    path: '/muster',
    routeRef: rootRouteRef,
  },
});

// Tab order follows the order these are listed in `extensions` below; the
// dashboard is first, so `/muster` redirects to it. Each sub-page's `path`
// matches its sub-route ref in ./routes so `useRouteRef(...)` links land on the
// right tab.
const dashboardSubPage = SubPageBlueprint.make({
  name: 'dashboard',
  params: {
    path: 'dashboard',
    title: 'Dashboard',
    loader: async () => {
      const { MusterProviders } = await import('./components/MusterProviders');
      const { DashboardPage } = await import('./components/DashboardPage');
      return (
        <MusterProviders>
          <DashboardPage />
        </MusterProviders>
      );
    },
  },
});

const mcpServersSubPage = SubPageBlueprint.make({
  name: 'mcp-servers',
  params: {
    path: 'mcp-servers',
    title: 'MCP servers',
    loader: async () => {
      const { MusterProviders } = await import('./components/MusterProviders');
      const { McpServersPage } = await import('./components/McpServersPage');
      return (
        <MusterProviders>
          <McpServersPage />
        </MusterProviders>
      );
    },
  },
});

const workflowsSubPage = SubPageBlueprint.make({
  name: 'workflows',
  params: {
    path: 'workflows',
    title: 'Workflows',
    loader: async () => {
      const { MusterProviders } = await import('./components/MusterProviders');
      const { WorkflowsRouter } = await import('./components/WorkflowsRouter');
      return (
        <MusterProviders>
          <WorkflowsRouter />
        </MusterProviders>
      );
    },
  },
});

const toolExplorerSubPage = SubPageBlueprint.make({
  name: 'tools',
  params: {
    path: 'tools',
    title: 'Tool explorer',
    loader: async () => {
      const { MusterProviders } = await import('./components/MusterProviders');
      const { ToolExplorerPage } =
        await import('./components/ToolExplorerPage');
      return (
        <MusterProviders>
          <ToolExplorerPage />
        </MusterProviders>
      );
    },
  },
});

const musterApi = ApiBlueprint.make({
  name: 'muster',
  params: defineParams =>
    defineParams({
      api: musterApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        configApi: configApiRef,
        authProvidersApi: musterAuthProvidersApiRef,
      },
      factory: ({ discoveryApi, fetchApi, configApi, authProvidersApi }) =>
        new MusterApiClient({
          discoveryApi,
          fetchApi,
          configApi,
          authProvidersApi,
        }),
    }),
});

// Default knows no providers; the app overrides this with the gs auth
// providers (see packages/app/src/modules/muster).
const musterAuthProvidersApi = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: musterAuthProvidersApiRef,
      deps: {},
      factory: () => new MusterAuthProviders(),
    }),
});

export const musterPlugin = createFrontendPlugin({
  pluginId: 'muster',
  extensions: [
    musterPage,
    dashboardSubPage,
    mcpServersSubPage,
    workflowsSubPage,
    toolExplorerSubPage,
    musterApi,
    musterAuthProvidersApi,
  ],
  routes: {
    root: rootRouteRef,
    mcpServers: mcpServersRouteRef,
    workflows: workflowsRouteRef,
    toolExplorer: toolExplorerRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
});
