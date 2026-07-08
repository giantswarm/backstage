import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { githubAuthApiRef } from '@backstage/core-plugin-api';
import TimelineIcon from '@material-ui/icons/Timeline';

import { roadmapApiRef, RoadmapApiClient } from './apis';
import { itemRouteRef, rootRouteRef } from './routes';

// Disabled by default: the roadmap board tracks internal planning and must
// not appear in customer portals. Deployments opt in via app-config
// `app.extensions` (`page:roadmap`, `api:roadmap`), the same gating pattern
// as the plans and ai-chat plugins.
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

// No `name`: the extension id is plain `api:roadmap`.
const roadmapApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: roadmapApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        githubAuthApi: githubAuthApiRef,
      },
      factory: ({ discoveryApi, fetchApi, githubAuthApi }) =>
        new RoadmapApiClient({ discoveryApi, fetchApi, githubAuthApi }),
    }),
});

export const roadmapPlugin = createFrontendPlugin({
  pluginId: 'roadmap',
  extensions: [roadmapPage, roadmapApi],
  routes: {
    root: rootRouteRef,
    item: itemRouteRef,
  },
});
