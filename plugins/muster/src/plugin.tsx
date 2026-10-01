import {
  ApiBlueprint,
  configApiRef,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';

import {
  musterApiRef,
  MusterApiClient,
  MusterAuthProviders,
  musterAuthProvidersApiRef,
} from './apis';
import { mcpUsageSection } from './mcpUsageSection';
import {
  mcpServerRouteRef,
  mcpServersRouteRef,
  mcpServerToolRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerRouteRef,
  workflowDetailRouteRef,
  workflowsRouteRef,
} from './routes';

// muster contributes two of the Agent Platform page's level-1 tabs: "MCP
// Servers" (`/agent-platform/mcp-servers`) and "Workflows"
// (`/agent-platform/workflows`). Each carries its own root route ref, so
// muster's links resolve under the tab they belong to. Their place among the
// Agent Platform's tabs is the page's own (agent-platform's
// `AGENT_PLATFORM_TAB_ORDER`), keyed by these extensions' ids.
const mcpServersSubPage = SubPageBlueprint.make({
  name: 'mcp-servers',
  attachTo: { id: 'page:agent-platform', input: 'pages' },
  params: {
    path: 'mcp-servers',
    title: 'MCP Servers',
    routeRef: mcpServersRouteRef,
    loader: async () => {
      const [{ MusterSubPage }, { McpServersRouter }] = await Promise.all([
        import('./components/MusterSubPage'),
        import('./components/McpServersRouter'),
      ]);
      return (
        <MusterSubPage context="The MCP servers of an installation are read through its Kubernetes API.">
          <McpServersRouter />
        </MusterSubPage>
      );
    },
  },
});

const workflowsSubPage = SubPageBlueprint.make({
  name: 'workflows',
  attachTo: { id: 'page:agent-platform', input: 'pages' },
  params: {
    path: 'workflows',
    title: 'Workflows',
    routeRef: workflowsRouteRef,
    loader: async () => {
      const [{ MusterSubPage }, { WorkflowsRouter }] = await Promise.all([
        import('./components/MusterSubPage'),
        import('./components/WorkflowsRouter'),
      ]);
      return (
        <MusterSubPage context="The workflows of an installation are read through its Kubernetes API.">
          <WorkflowsRouter />
        </MusterSubPage>
      );
    },
  },
});

// The kubernetes APIs are dependencies because a muster other than the home
// installation's is reached with that installation's brokered Dex token, minted
// through them (kubernetesApi.getCluster → kubernetesAuthProvidersApi
// .getCredentials) exactly like the kagent and model-manager clients do. The
// home installation keeps the `authProvidersApi` (main-login) token.
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
        kubernetesApi: kubernetesApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: deps => new MusterApiClient(deps),
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
    mcpServersSubPage,
    workflowsSubPage,
    mcpUsageSection,
    musterApi,
    musterAuthProvidersApi,
  ],
  routes: {
    mcpServers: mcpServersRouteRef,
    mcpServer: mcpServerRouteRef,
    mcpServerTool: mcpServerToolRouteRef,
    newMcpServer: newMcpServerRouteRef,
    newMcpServerAuth: newMcpServerAuthRouteRef,
    workflows: workflowsRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
});
