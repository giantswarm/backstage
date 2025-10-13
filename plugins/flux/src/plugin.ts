import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  rootRouteRef,
  resourcesSubRouteRef,
  overviewSubRouteRef,
} from './routes';

export const fluxPlugin = createPlugin({
  id: 'flux',
  routes: {
    root: rootRouteRef,
    overview: overviewSubRouteRef,
    resources: resourcesSubRouteRef,
  },
});

export const FluxPage = fluxPlugin.provide(
  createRoutableExtension({
    name: 'FluxPage',
    component: () => import('./components/FluxPage').then(m => m.FluxPage),
    mountPoint: rootRouteRef,
  }),
);
