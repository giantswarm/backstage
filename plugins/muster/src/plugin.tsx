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
  agentPlatformUsageExternalRouteRef,
  mcpServersRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerRouteRef,
  rootRouteRef,
  toolExplorerRouteRef,
  workflowDetailRouteRef,
  workflowsRouteRef,
} from './routes';

// Muster is a section embedded under the Agent Platform page: this SubPageBlueprint
// attaches to `page:agent-platform` as its "MCP Servers" tab (mounted at
// `/agent-platform/muster`). `rootRouteRef` is carried here so muster's route refs
// resolve relative to `/agent-platform/muster`, keeping every `useRouteRef` link
// working. The four muster views (Dashboard, MCP servers, Workflows, Tool explorer)
// render as a second-level tab row inside MusterSection.
const musterSubPage = SubPageBlueprint.make({
  name: 'mcp-servers',
  attachTo: { id: 'page:agent-platform', input: 'pages' },
  params: {
    path: 'muster',
    title: 'MCP Servers',
    routeRef: rootRouteRef,
    loader: async () => {
      const { MusterSection } = await import('./components/MusterSection');
      return <MusterSection />;
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
    musterSubPage,
    mcpUsageSection,
    musterApi,
    musterAuthProvidersApi,
  ],
  routes: {
    root: rootRouteRef,
    mcpServers: mcpServersRouteRef,
    newMcpServer: newMcpServerRouteRef,
    newMcpServerAuth: newMcpServerAuthRouteRef,
    workflows: workflowsRouteRef,
    toolExplorer: toolExplorerRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
  // Points at the Agent Platform's Usage tab, where the MCP usage view now
  // lives. `defaultTarget` resolves it without an app-config binding and leaves
  // it simply unbound when that plugin is disabled, so every `useRouteRef` call
  // site must handle `undefined`.
  externalRoutes: {
    agentPlatformUsage: agentPlatformUsageExternalRouteRef,
  },
});
