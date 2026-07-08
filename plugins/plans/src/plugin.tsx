import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import AssignmentIcon from '@material-ui/icons/Assignment';

import { plansApiRef, PlansApiClient } from './apis';
import { pullRouteRef, rootRouteRef } from './routes';

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

// No `name`: the extension id is plain `api:plans`.
const plansApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: plansApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new PlansApiClient({ discoveryApi, fetchApi }),
    }),
});

export const plansPlugin = createFrontendPlugin({
  pluginId: 'plans',
  extensions: [plansPage, plansApi],
  routes: {
    root: rootRouteRef,
    pull: pullRouteRef,
  },
});
