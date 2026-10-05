import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import AssignmentIcon from '@material-ui/icons/Assignment';
import MenuBookIcon from '@material-ui/icons/MenuBook';

import { plansApiRef, PlansApiClient, plansAuthApiRef } from './apis';
import {
  magazineRouteRef,
  pullRouteRef,
  roadmapItemExternalRouteRef,
  rootRouteRef,
} from './routes';

// Disabled by default: the plans page serves internal planning documents and
// must not appear in customer portals. Deployments opt in via app-config
// `app.extensions` (`page:plans`, `api:plans`), the same gating pattern as
// the ai-chat plugin.
const plansPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Plans',
    icon: <AssignmentIcon />,
    path: '/plans',
    routeRef: rootRouteRef,
    loader: async () => {
      const { PlansProviders } = await import('./components/PlansProviders');
      const { PlansRouter } = await import('./components/PlansRouter');
      return (
        <PlansProviders>
          <PlansRouter />
        </PlansProviders>
      );
    },
  },
});

// The team product magazine at `/product`: extension id
// `page:plans/magazine`, disabled by default like the plans page. It reads
// the repository in `plans.magazine` through the same API.
const magazinePage = PageBlueprint.make({
  name: 'magazine',
  disabled: true,
  params: {
    title: 'Magazine',
    icon: <MenuBookIcon />,
    path: '/product',
    routeRef: magazineRouteRef,
    loader: async () => {
      const { PlansProviders } = await import('./components/PlansProviders');
      const { MagazinePage } = await import('./components/MagazinePage');
      return (
        <PlansProviders>
          <MagazinePage />
        </PlansProviders>
      );
    },
  },
});

// No `name`: the extension id is plain `api:plans`.
const plansApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: plansApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        authApi: plansAuthApiRef,
      },
      factory: ({ discoveryApi, fetchApi, authApi }) =>
        new PlansApiClient({ discoveryApi, fetchApi, authApi }),
    }),
});

export const plansPlugin = createFrontendPlugin({
  pluginId: 'plans',
  extensions: [plansPage, magazinePage, plansApi],
  routes: {
    root: rootRouteRef,
    pull: pullRouteRef,
    magazine: magazineRouteRef,
  },
  externalRoutes: {
    roadmapItem: roadmapItemExternalRouteRef,
  },
});
