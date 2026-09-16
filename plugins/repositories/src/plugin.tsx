import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import AccountTreeIcon from '@material-ui/icons/AccountTree';

import {
  repositoriesApiRef,
  RepositoriesApiClient,
  repositoriesAuthApiRef,
} from './apis';
import { rootRouteRef } from './routes';

// Disabled by default: the Repositories page is Giant Swarm's own inventory
// and must not appear in customer portals. A deployment opts in via
// app-config `app.extensions` (`page:repositories`, `api:repositories`), the
// same gating as the plans plugin.
const repositoriesPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Repositories',
    icon: <AccountTreeIcon />,
    path: '/repositories',
    routeRef: rootRouteRef,
    loader: async () => {
      const { RepositoriesProviders } =
        await import('./components/RepositoriesProviders');
      const { RepositoriesPage } =
        await import('./components/RepositoriesPage');
      return (
        <RepositoriesProviders>
          <RepositoriesPage />
        </RepositoriesProviders>
      );
    },
  },
});

// No `name`: the extension id is plain `api:repositories`.
const repositoriesApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: repositoriesApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        authApi: repositoriesAuthApiRef,
      },
      factory: ({ discoveryApi, fetchApi, authApi }) =>
        new RepositoriesApiClient({ discoveryApi, fetchApi, authApi }),
    }),
});

export const repositoriesPlugin = createFrontendPlugin({
  pluginId: 'repositories',
  extensions: [repositoriesPage, repositoriesApi],
  routes: {
    root: rootRouteRef,
  },
});
