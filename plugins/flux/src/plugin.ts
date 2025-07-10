import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const fluxPlugin = createPlugin({
  id: 'flux',
  routes: {
    root: rootRouteRef,
  },
});

export const FluxPage = fluxPlugin.provide(
  createRoutableExtension({
    name: 'FluxPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
