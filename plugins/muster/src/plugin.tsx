import {
  ApiBlueprint,
  configApiRef,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
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

const musterPage = PageBlueprint.make({
  params: {
    title: 'MCP Servers',
    icon: <AccountTreeIcon />,
    path: '/muster',
    routeRef: rootRouteRef,
    loader: () => import('./components/Router').then(m => <m.Router />),
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
  extensions: [musterPage, musterApi, musterAuthProvidersApi],
  routes: {
    root: rootRouteRef,
    mcpServers: mcpServersRouteRef,
    workflows: workflowsRouteRef,
    toolExplorer: toolExplorerRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
});
