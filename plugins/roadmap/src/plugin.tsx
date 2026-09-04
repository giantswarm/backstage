import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import TimelineIcon from '@material-ui/icons/Timeline';

import { roadmapApiRef, RoadmapApiClient, roadmapAuthApiRef } from './apis';
import {
  itemRouteRef,
  plansPullExternalRouteRef,
  plansRootExternalRouteRef,
  rootRouteRef,
} from './routes';

// Disabled by default: the roadmap board is internal and must not appear in
// customer portals. Deployments opt in via app.extensions (and configure
// roadmap.board for the backend).
const roadmapPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Roadmap',
    icon: <TimelineIcon />,
    path: '/roadmap',
    routeRef: rootRouteRef,
    loader: async () => {
      const { RoadmapProviders } =
        await import('./components/RoadmapProviders');
      const { RoadmapRouter } = await import('./components/RoadmapRouter');
      return (
        <RoadmapProviders>
          <RoadmapRouter />
        </RoadmapProviders>
      );
    },
  },
});

const roadmapApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: roadmapApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        authApi: roadmapAuthApiRef,
      },
      factory: ({ discoveryApi, fetchApi, authApi }) =>
        new RoadmapApiClient({ discoveryApi, fetchApi, authApi }),
    }),
});

export const roadmapPlugin = createFrontendPlugin({
  pluginId: 'roadmap',
  extensions: [roadmapPage, roadmapApi],
  routes: {
    root: rootRouteRef,
    item: itemRouteRef,
  },
  externalRoutes: {
    plansRoot: plansRootExternalRouteRef,
    plansPull: plansPullExternalRouteRef,
  },
});
