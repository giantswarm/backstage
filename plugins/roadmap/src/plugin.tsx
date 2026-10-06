import {
  ApiBlueprint,
  configApiRef,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';

import {
  roadmapApiRef,
  RoadmapApiClient,
  roadmapAuthApiRef,
  RoadmapFixtureApi,
} from './apis';
import {
  itemRouteRef,
  legacyRootRouteRef,
  plansPullExternalRouteRef,
  plansRootExternalRouteRef,
  rootRouteRef,
} from './routes';

// The board is Hive's Roadmap tab (`/hive/roadmap`): a sub-page attached to
// the plans plugin's Hive page by node id, the way muster attaches its tabs
// to the Agent Platform. It owns `rootRouteRef`, so an item's detail
// (`itemRouteRef`) opens inside Hive. Hive is disabled by default (internal
// only); this tab follows its page.
const hiveRoadmapSubPage = SubPageBlueprint.make({
  name: 'hive',
  attachTo: { id: 'page:plans/hive', input: 'pages' },
  params: {
    path: 'roadmap',
    title: 'Roadmap',
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

// The old page stays as a nav-less redirect, so every shared link resolves:
// `/roadmap/items/:id?…` → `/hive/roadmap/items/:id?…`.
const roadmapPage = PageBlueprint.make({
  disabled: true,
  params: {
    path: '/roadmap',
    routeRef: legacyRootRouteRef,
    noHeader: true,
    loader: async () => {
      const { RoadmapRedirect } = await import('./components/RoadmapRedirect');
      return <RoadmapRedirect />;
    },
  },
});

// `roadmap.fixtures: true` serves an in-memory board instead of the backend,
// for local development without muster.
const roadmapApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: roadmapApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        authApi: roadmapAuthApiRef,
      },
      factory: ({ configApi, discoveryApi, fetchApi, authApi }) =>
        configApi.getOptionalBoolean('roadmap.fixtures')
          ? new RoadmapFixtureApi()
          : new RoadmapApiClient({ discoveryApi, fetchApi, authApi }),
    }),
});

export const roadmapPlugin = createFrontendPlugin({
  pluginId: 'roadmap',
  extensions: [hiveRoadmapSubPage, roadmapPage, roadmapApi],
  routes: {
    root: rootRouteRef,
    item: itemRouteRef,
  },
  externalRoutes: {
    plansRoot: plansRootExternalRouteRef,
    plansPull: plansPullExternalRouteRef,
  },
});
