import {
  ApiBlueprint,
  configApiRef,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';

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
  extensions: [musterSubPage, musterApi, musterAuthProvidersApi],
  routes: {
    root: rootRouteRef,
    mcpServers: mcpServersRouteRef,
    workflows: workflowsRouteRef,
    toolExplorer: toolExplorerRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
});
