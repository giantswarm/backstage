import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef, resourcesRouteRef } from './routes';

export const fluxPlugin = createPlugin({
  id: 'flux',
  routes: {
    root: rootRouteRef,
  },
});

export const FluxPage = fluxPlugin.provide(
  createRoutableExtension({
    name: 'FluxPage',
    component: () => import('./components/FluxPage').then(m => m.FluxPage),
    mountPoint: rootRouteRef,
  }),
);

export const FluxResourcesPage = fluxPlugin.provide(
  createRoutableExtension({
    name: 'FluxResourcesPage',
    component: () =>
      import('@giantswarm/backstage-plugin-flux-react').then(
        m => m.FluxResourcesPage,
      ),
    mountPoint: resourcesRouteRef,
  }),
);
