import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { entityDeploymentsRouteRef, rootRouteRef } from './routes';

export const gsPlugin = createPlugin({
  id: 'gs',
  routes: {
    root: rootRouteRef,
    entityContent: entityDeploymentsRouteRef,
  },
});

export const GSClustersPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSClustersPage',
    component: () =>
      import('./components/ClustersPage').then(m => m.ClustersPage),
    mountPoint: rootRouteRef,
  }),
);

export const EntityGSDeploymentsContent = gsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGSDeploymentsContent',
    component: () => import('./components/Router').then(m => m.Router),
    mountPoint: entityDeploymentsRouteRef,
  }),
);
