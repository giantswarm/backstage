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
import { createRepositoryRouteRef, rootRouteRef } from './routes';

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
      const { RepositoriesRouter } =
        await import('./components/RepositoriesRouter');
      return <RepositoriesRouter />;
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
    // Bind `catalog.createComponent` to `repositories.create` so the
    // catalog's Create… lands on the declaration form.
    create: createRepositoryRouteRef,
  },
});
